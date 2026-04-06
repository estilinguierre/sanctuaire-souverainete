import json
import uuid
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.models import ChatMessage, ChatRequest, ChatResponse, ChatRole
from app.services import knowledge_base, llm

router = APIRouter()


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Single-shot chat completion with RAG context injection."""
    if not req.session_id:
        req.session_id = str(uuid.uuid4())

    # Extract last user message for KB search
    user_msg = next(
        (m for m in reversed(req.messages) if m.role == ChatRole.user), None
    )
    query = user_msg.content if user_msg else ""

    # Semantic search for relevant context
    context_chunks = []
    if query:
        context_chunks = await knowledge_base.semantic_search(
            query=query,
            n_results=8,
        )

    return await llm.chat_completion(
        messages=req.messages,
        context_chunks=context_chunks,
        session_id=req.session_id,
    )


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    """SSE streaming chat — yields text deltas as server-sent events."""
    if not req.session_id:
        req.session_id = str(uuid.uuid4())

    user_msg = next(
        (m for m in reversed(req.messages) if m.role == ChatRole.user), None
    )
    query = user_msg.content if user_msg else ""

    context_chunks = []
    if query:
        context_chunks = await knowledge_base.semantic_search(query=query, n_results=8)

    async def event_generator():
        # Send session_id first
        yield f"data: {json.dumps({'session_id': req.session_id, 'type': 'start'})}\n\n"

        async for delta in llm.stream_completion(
            messages=req.messages,
            context_chunks=context_chunks,
            session_id=req.session_id,
        ):
            payload = json.dumps({"delta": delta, "type": "delta"})
            yield f"data: {payload}\n\n"

        # Send sources at end
        sources = [s.model_dump() for s in context_chunks[:5]]
        yield f"data: {json.dumps({'sources': sources, 'type': 'done'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/history/{session_id}")
async def get_history(session_id: str):
    history = llm.get_session_history(session_id)
    return {"session_id": session_id, "messages": history, "count": len(history)}


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    llm.clear_session(session_id)
    return {"status": "cleared", "session_id": session_id}
