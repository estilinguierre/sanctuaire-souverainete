"""
ChromaDB knowledge base — document storage and semantic search.
"""
from __future__ import annotations

import uuid
from typing import Dict, List, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import get_settings
from app.models import SourceChunk
from app.services.embeddings import embed_query, embed_texts
from app.utils.chunking import TextChunk
from app.utils.logger import get_logger

logger = get_logger("ctm.knowledge_base")
settings = get_settings()

_chroma_client: chromadb.PersistentClient | None = None
_collection = None


def _get_collection():
    global _chroma_client, _collection
    if _collection is None:
        _chroma_client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        _collection = _chroma_client.get_or_create_collection(
            name=settings.chroma_collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            f"ChromaDB collection '{settings.chroma_collection_name}' ready "
            f"({_collection.count()} documents)"
        )
    return _collection


async def add_documents(chunks: List[TextChunk]) -> int:
    """
    Embed and upsert chunks into ChromaDB.
    Returns number of documents added.
    """
    if not chunks:
        return 0

    collection = _get_collection()
    texts = [c.content for c in chunks]
    embeddings = await embed_texts(texts)

    ids = [str(uuid.uuid4()) for _ in chunks]
    metadatas = [c.metadata for c in chunks]

    collection.upsert(
        ids=ids,
        embeddings=embeddings,
        documents=texts,
        metadatas=metadatas,
    )
    logger.info(f"Upserted {len(chunks)} chunks into ChromaDB")
    return len(chunks)


async def semantic_search(
    query: str,
    n_results: int = 8,
    filter_material: Optional[str] = None,
    filter_operation: Optional[str] = None,
) -> List[SourceChunk]:
    """
    Semantic similarity search.
    Optionally filter by material or operation_type metadata.
    """
    collection = _get_collection()
    if collection.count() == 0:
        logger.warning("Knowledge base is empty — no results")
        return []

    query_embedding = await embed_query(query)

    where: Optional[Dict] = None
    filters = {}
    if filter_material:
        filters["material"] = filter_material
    if filter_operation:
        filters["operation_type"] = filter_operation
    if filters:
        where = filters

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(n_results, collection.count()),
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    chunks: List[SourceChunk] = []
    for doc, meta, dist in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        chunks.append(
            SourceChunk(
                title=meta.get("source", "Document"),
                section=meta.get("section", ""),
                content_preview=doc[:300],
                score=round(1 - dist, 4),  # cosine distance → similarity
                source_url=meta.get("source_url", ""),
            )
        )

    return chunks


def get_stats() -> Dict:
    """Return collection statistics."""
    try:
        collection = _get_collection()
        return {
            "collection": settings.chroma_collection_name,
            "document_count": collection.count(),
            "persist_dir": settings.chroma_persist_dir,
        }
    except Exception as e:
        return {"error": str(e), "document_count": 0}
