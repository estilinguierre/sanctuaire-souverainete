"""
OpenAI embedding service with batching and retry.
"""
from __future__ import annotations

from typing import List

from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import get_settings
from app.utils.logger import get_logger

logger = get_logger("ctm.embeddings")
settings = get_settings()

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Embed a list of texts using text-embedding-3-large.
    Processes in batches of 100 (OpenAI limit).
    """
    client = _get_client()
    all_embeddings: List[List[float]] = []
    batch_size = 100

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        logger.debug(f"Embedding batch {i//batch_size + 1}: {len(batch)} texts")

        response = await client.embeddings.create(
            model=settings.embedding_model,
            input=batch,
        )
        all_embeddings.extend([item.embedding for item in response.data])

    return all_embeddings


async def embed_query(query: str) -> List[float]:
    """Embed a single query string."""
    results = await embed_texts([query])
    return results[0]
