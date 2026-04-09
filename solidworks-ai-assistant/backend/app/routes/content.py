from pathlib import Path
from typing import List

from fastapi import APIRouter, HTTPException

from app.models import GuideInfo, KnowledgeSearchRequest, SourceChunk
from app.services import knowledge_base

router = APIRouter()

# Obsidian export root (mounted read-only in Docker)
OBSIDIAN_ROOT = Path("obsidian_export/Guides_Industriels")
# Also check generated guides
GENERATED_ROOT = Path("data/industrial_guides")


def _collect_guides(root: Path, category_prefix: str = "") -> List[GuideInfo]:
    guides = []
    if not root.exists():
        return guides
    for md_file in sorted(root.rglob("*.md")):
        rel = md_file.relative_to(root)
        category = rel.parts[0] if len(rel.parts) > 1 else category_prefix
        slug = str(rel).replace("\\", "/").removesuffix(".md")
        title = md_file.stem.replace("_", " ").lstrip("0123456789 ")
        guides.append(
            GuideInfo(
                slug=slug,
                title=title,
                category=category,
                file_path=str(md_file),
                size_bytes=md_file.stat().st_size,
            )
        )
    return guides


@router.get("/guides", response_model=List[GuideInfo])
async def list_guides():
    """List all available industrial guides (Obsidian + generated)."""
    guides = _collect_guides(OBSIDIAN_ROOT, "Obsidian")
    guides += _collect_guides(GENERATED_ROOT, "Généré")
    return guides


@router.get("/guides/{slug:path}")
async def get_guide(slug: str):
    """Return full Markdown content of a guide by slug."""
    for root in [OBSIDIAN_ROOT, GENERATED_ROOT]:
        candidate = root / f"{slug}.md"
        if candidate.exists():
            return {
                "slug": slug,
                "content": candidate.read_text(encoding="utf-8"),
                "size_bytes": candidate.stat().st_size,
            }
    raise HTTPException(status_code=404, detail=f"Guide '{slug}' introuvable.")


@router.post("/search", response_model=List[SourceChunk])
async def search_knowledge(req: KnowledgeSearchRequest):
    """Semantic search in the ChromaDB knowledge base."""
    return await knowledge_base.semantic_search(
        query=req.query,
        n_results=req.n_results,
        filter_material=req.filter_material,
        filter_operation=req.filter_operation,
    )
