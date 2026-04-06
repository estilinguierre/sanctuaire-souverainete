"""
Semantic text chunking for the knowledge base.
Splits on Markdown headers first, then enforces token limits.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List

import tiktoken


ENCODER = tiktoken.get_encoding("cl100k_base")
MAX_TOKENS = 800
OVERLAP_TOKENS = 100


@dataclass
class TextChunk:
    content: str
    metadata: dict = field(default_factory=dict)

    @property
    def token_count(self) -> int:
        return len(ENCODER.encode(self.content))


def _token_split(text: str, max_tokens: int, overlap: int) -> List[str]:
    """Split a long text into overlapping token windows."""
    tokens = ENCODER.encode(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + max_tokens, len(tokens))
        chunk_tokens = tokens[start:end]
        chunks.append(ENCODER.decode(chunk_tokens))
        if end == len(tokens):
            break
        start = end - overlap
    return chunks


def chunk_markdown(
    text: str,
    source: str = "",
    operation_type: str = "",
    material: str = "",
) -> List[TextChunk]:
    """
    Split Markdown document into semantic chunks.
    1. Split on H1/H2 headers
    2. Further split oversized sections by token window
    """
    # Split on H1/H2 boundaries, keeping the header with its content
    sections = re.split(r"(?=^#{1,2} )", text, flags=re.MULTILINE)
    sections = [s.strip() for s in sections if s.strip()]

    chunks: List[TextChunk] = []
    for section in sections:
        # Extract section title for metadata
        title_match = re.match(r"^(#{1,3} .+)", section)
        title = title_match.group(1).lstrip("#").strip() if title_match else ""

        base_meta = {
            "source": source,
            "section": title,
            "operation_type": operation_type,
            "material": material,
        }

        tokens = ENCODER.encode(section)
        if len(tokens) <= MAX_TOKENS:
            chunks.append(TextChunk(content=section, metadata=base_meta))
        else:
            for i, sub in enumerate(_token_split(section, MAX_TOKENS, OVERLAP_TOKENS)):
                meta = {**base_meta, "chunk_index": i}
                chunks.append(TextChunk(content=sub, metadata=meta))

    return chunks
