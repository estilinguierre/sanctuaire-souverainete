"""
Embedding service — OpenAI text-embedding-3-large with ChromaDB ONNX fallback.

Priority:
  1. OpenAI API (if OPENAI_API_KEY is set and not a placeholder)
  2. ChromaDB built-in ONNX model (all-MiniLM-L6-v2, 384-dim, fully local, cached)
"""
from __future__ import annotations

import asyncio
from typing import List, Optional

from app.config import get_settings
from app.utils.logger import get_logger

logger = get_logger("ctm.embeddings")
settings = get_settings()

# ── OpenAI client (lazy) ──────────────────────────────────────────────────────
_openai_client = None
_openai_available: Optional[bool] = None  # None = not yet probed


def _is_placeholder_key(key: str) -> bool:
    return not key or key.startswith("sk-placeholder") or len(key) < 20


def _get_openai_client():
    global _openai_client, _openai_available
    if _openai_available is False:
        return None
    if _openai_client is not None:
        return _openai_client
    if _is_placeholder_key(settings.openai_api_key):
        _openai_available = False
        logger.info("OpenAI API key is a placeholder — using local ONNX embeddings")
        return None
    try:
        from openai import AsyncOpenAI
        _openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
        _openai_available = True
        logger.info("OpenAI embedding client initialised (text-embedding-3-large)")
    except Exception as e:
        _openai_available = False
        logger.warning(f"OpenAI client init failed: {e} — falling back to local ONNX")
    return _openai_client


# ── ChromaDB ONNX model (lazy) ────────────────────────────────────────────────
_onnx_ef = None


def _get_onnx_ef():
    global _onnx_ef
    if _onnx_ef is not None:
        return _onnx_ef
    from chromadb.utils import embedding_functions
    logger.info("Loading ChromaDB ONNX embedding model (all-MiniLM-L6-v2) …")
    _onnx_ef = embedding_functions.DefaultEmbeddingFunction()
    logger.info("ONNX embedding model ready (384-dim)")
    return _onnx_ef


# ── Public API ────────────────────────────────────────────────────────────────

async def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of texts.
    Uses OpenAI when key is valid, otherwise ChromaDB ONNX locally.
    """
    client = _get_openai_client()
    if client is not None:
        return await _embed_openai(client, texts)
    return await _embed_onnx(texts)


async def embed_query(query: str) -> List[float]:
    """Embed a single query string."""
    results = await embed_texts([query])
    return results[0]


# ── Backends ──────────────────────────────────────────────────────────────────

async def _embed_openai(client, texts: List[str]) -> List[List[float]]:
    from tenacity import retry, stop_after_attempt, wait_exponential

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def _batch(batch):
        response = await client.embeddings.create(
            model=settings.embedding_model,
            input=batch,
        )
        return [item.embedding for item in response.data]

    all_embeddings: List[List[float]] = []
    for i in range(0, len(texts), 100):
        batch = texts[i: i + 100]
        logger.debug(f"OpenAI embedding batch {i // 100 + 1}: {len(batch)} texts")
        all_embeddings.extend(await _batch(batch))
    return all_embeddings


async def _embed_onnx(texts: List[str]) -> List[List[float]]:
    """Run ONNX embedding in a thread so we don't block the event loop."""
    ef = _get_onnx_ef()

    def _encode():
        return [list(v) for v in ef(texts)]

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _encode)
