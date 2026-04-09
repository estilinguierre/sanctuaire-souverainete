"""
Semantic text chunking for the knowledge base.
Splits on Markdown headers first, then enforces size limits.
Falls back to character-based splitting when tiktoken is unavailable
(e.g. air-gapped / network-restricted environments).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

# ---------------------------------------------------------------------------
# Encoder — tiktoken preferred, character fallback
# ---------------------------------------------------------------------------

_encoder = None
_CHARS_PER_TOKEN = 4  # approximation for fallback


def _get_encoder():
    global _encoder
    if _encoder is not None:
        return _encoder
    try:
        import tiktoken
        _encoder = tiktoken.get_encoding("cl100k_base")
    except Exception:
        _encoder = None  # network unavailable — use char fallback
    return _encoder


def _encode(text: str) -> list:
    enc = _get_encoder()
    if enc:
        return enc.encode(text)
    # Fallback: treat every 4 chars as 1 token
    return list(range(len(text) // _CHARS_PER_TOKEN + 1))


def _decode(tokens, original_text: str, start: int, end: int) -> str:
    enc = _get_encoder()
    if enc:
        return enc.decode(tokens[start:end])
    # Char fallback
    char_start = start * _CHARS_PER_TOKEN
    char_end = min(end * _CHARS_PER_TOKEN, len(original_text))
    return original_text[char_start:char_end]


def _token_len(text: str) -> int:
    enc = _get_encoder()
    if enc:
        return len(enc.encode(text))
    return len(text) // _CHARS_PER_TOKEN


MAX_TOKENS = 800
OVERLAP_TOKENS = 100


@dataclass
class TextChunk:
    content: str
    metadata: dict = field(default_factory=dict)

    @property
    def token_count(self) -> int:
        return _token_len(self.content)


def _token_split(text: str, max_tokens: int, overlap: int) -> List[str]:
    """Split a long text into overlapping token windows."""
    enc = _get_encoder()
    if enc:
        tokens = enc.encode(text)
        chunks = []
        start = 0
        while start < len(tokens):
            end = min(start + max_tokens, len(tokens))
            chunks.append(enc.decode(tokens[start:end]))
            if end == len(tokens):
                break
            start = end - overlap
        return chunks

    # Character-based fallback
    chunk_chars = max_tokens * _CHARS_PER_TOKEN
    overlap_chars = overlap * _CHARS_PER_TOKEN
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_chars, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = end - overlap_chars
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
    sections = re.split(r"(?=^#{1,2} )", text, flags=re.MULTILINE)
    sections = [s.strip() for s in sections if s.strip()]

    chunks: List[TextChunk] = []
    for section in sections:
        title_match = re.match(r"^(#{1,3} .+)", section)
        title = title_match.group(1).lstrip("#").strip() if title_match else ""

        base_meta = {
            "source": source,
            "section": title,
            "operation_type": operation_type,
            "material": material,
        }

        if _token_len(section) <= MAX_TOKENS:
            chunks.append(TextChunk(content=section, metadata=base_meta))
        else:
            for i, sub in enumerate(_token_split(section, MAX_TOKENS, OVERLAP_TOKENS)):
                meta = {**base_meta, "chunk_index": i}
                chunks.append(TextChunk(content=sub, metadata=meta))

    return chunks
