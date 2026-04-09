"""
LLM service — GPT-4 Turbo with CTM Industrie system prompt.
Supports standard completion and SSE streaming.
"""
from __future__ import annotations

import time
import uuid
from typing import AsyncGenerator, Dict, List, Optional

from openai import AsyncOpenAI

from app.config import get_settings
from app.models import ChatMessage, ChatResponse, ChatRole, SourceChunk
from app.utils.logger import get_logger

logger = get_logger("ctm.llm")
settings = get_settings()

# ---------------------------------------------------------------------------
# System prompt — CTM Industrie expert identity
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Tu es l'assistant IA expert de CTM Industrie, spécialisé en SolidWorks \
pour la tôlerie industrielle, la chaudronnerie et les structures métalliques.
Tu travailles à Dives-sur-Mer, Normandie.

## Identité
- Nom : Assistant CTM SolidWorks
- Langue : Français technique exclusivement
- Niveau : Ingénieur / formateur industriel senior

## Matériaux maîtrisés
- Aciers doux : S235 (EN 10025-2), S355 (EN 10025-2)
- Inox austénitique : 304L / 316L (EN 10088)
- Aluminium : 5754 H111 (EN 573-3)

## Machines CTM
- Presse-plieuse : AMADA HFE 100-30 (100T, 3050mm)
- Découpe laser : TRUMPF TruLaser 3030 (CO2, 4kW, format 3000×1500mm)
- Soudage robotisé : KUKA KR16 R2010 (MIG/MAG, fil ER70S-6)

## Règles de réponse
1. Donne toujours des valeurs numériques précises (K-factor, rayons mini, BA, BD).
2. Affiche la formule avant le résultat numérique.
3. Cite tes sources documentaires (guide, norme, retour terrain).
4. Si une commande SolidWorks est exécutée via MCP, décris l'action réalisée.
5. En cas de doute sur la fabricabilité, avertis clairement et propose une alternative.
6. Structure tes réponses avec des titres Markdown.

## Formules fondamentales
- Bend Allowance : BA = (π/180) × α × (R + K × T)
- Bend Deduction : BD = 2 × OSSB − BA
  où OSSB = tan(α/2) × (R + T)
- Développé total : L_dev = Σ(brides) + Σ(BA)

## Normes de référence
- NF EN ISO 2768 (tolérances générales)
- NF EN ISO 9692 (préparations soudure)
- EN 10025 (aciers de construction)
- EN 13480 (tuyauterie industrielle)
"""

# In-memory session history (replace with Redis for production)
_sessions: Dict[str, List[Dict]] = {}


def _get_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=settings.openai_api_key)


def _build_context_block(chunks: List[SourceChunk]) -> str:
    if not chunks:
        return ""
    lines = ["## Contexte documentaire pertinent\n"]
    for i, c in enumerate(chunks[:settings.max_context_chunks], 1):
        lines.append(f"**[{i}] {c.title}** — {c.section}")
        lines.append(c.content_preview)
        lines.append("")
    return "\n".join(lines)


def _build_openai_messages(
    messages: List[ChatMessage],
    context_chunks: List[SourceChunk],
    session_id: str,
) -> List[Dict]:
    history = _sessions.get(session_id, [])

    openai_msgs = [{"role": "system", "content": SYSTEM_PROMPT}]

    # Inject context as system message
    context_block = _build_context_block(context_chunks)
    if context_block:
        openai_msgs.append({"role": "system", "content": context_block})

    # Previous turns from session
    openai_msgs.extend(history[-10:])  # keep last 5 exchanges

    # Current messages
    for m in messages:
        openai_msgs.append({"role": m.role.value, "content": m.content})

    return openai_msgs


async def chat_completion(
    messages: List[ChatMessage],
    context_chunks: List[SourceChunk],
    session_id: str = "",
) -> ChatResponse:
    """Single-shot chat completion."""
    if not session_id:
        session_id = str(uuid.uuid4())

    client = _get_client()
    openai_messages = _build_openai_messages(messages, context_chunks, session_id)

    t0 = time.perf_counter()
    response = await client.chat.completions.create(
        model=settings.llm_model,
        messages=openai_messages,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
    )

    answer = response.choices[0].message.content or ""
    tokens = response.usage.total_tokens if response.usage else 0

    # Persist turn to session
    last_user = messages[-1] if messages else None
    if last_user:
        session_history = _sessions.setdefault(session_id, [])
        session_history.append({"role": "user", "content": last_user.content})
        session_history.append({"role": "assistant", "content": answer})

    return ChatResponse(
        answer=answer,
        sources=context_chunks[:5],
        tokens_used=tokens,
        session_id=session_id,
        response_time=round(time.perf_counter() - t0, 3),
    )


async def stream_completion(
    messages: List[ChatMessage],
    context_chunks: List[SourceChunk],
    session_id: str = "",
) -> AsyncGenerator[str, None]:
    """SSE streaming chat — yields text deltas."""
    if not session_id:
        session_id = str(uuid.uuid4())

    client = _get_client()
    openai_messages = _build_openai_messages(messages, context_chunks, session_id)

    full_answer: List[str] = []

    stream = await client.chat.completions.create(
        model=settings.llm_model,
        messages=openai_messages,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            full_answer.append(delta)
            yield delta

    # Persist completed answer
    last_user = messages[-1] if messages else None
    if last_user:
        session_history = _sessions.setdefault(session_id, [])
        session_history.append({"role": "user", "content": last_user.content})
        session_history.append({"role": "assistant", "content": "".join(full_answer)})


def get_session_history(session_id: str) -> List[Dict]:
    return _sessions.get(session_id, [])


def clear_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
