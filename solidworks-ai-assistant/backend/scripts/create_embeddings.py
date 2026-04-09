"""
Index all scraped docs + Obsidian guides into ChromaDB.
Usage: python scripts/create_embeddings.py
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.knowledge_base import add_documents, get_stats
from app.utils.chunking import chunk_markdown
from app.utils.logger import setup_logging, app_logger


_BACKEND_DIR = Path(__file__).parent.parent
_PROJECT_DIR = _BACKEND_DIR.parent

PROCESSED_DIR = _BACKEND_DIR / "data/processed"
OBSIDIAN_ROOT = _PROJECT_DIR / "obsidian_export/Guides_Industriels"
GENERATED_ROOT = _BACKEND_DIR / "data/industrial_guides"

OPERATION_MAP = {
    "Tôlerie": "tolerie",
    "Chaudronnerie": "chaudronnerie",
    "Structures_Métalliques": "structures",
    "Configuration_SolidWorks": "configuration",
    "tolerie": "tolerie",
    "chaudronnerie": "chaudronnerie",
    "structures": "structures",
    "configuration_sw": "configuration",
}


async def index_json_files():
    """Index scraped JSON files from data/processed/."""
    total = 0
    for json_file in sorted(PROCESSED_DIR.glob("*.json")):
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
            chunks = chunk_markdown(
                data.get("content", ""),
                source=data.get("title", json_file.stem),
                operation_type="solidworks_help",
            )
            if chunks:
                added = await add_documents(chunks)
                total += added
                app_logger.info(f"Indexed {json_file.name}: {added} chunks")
        except Exception as e:
            app_logger.error(f"Error indexing {json_file}: {e}")
    return total


async def index_markdown_files(root: Path):
    """Index Markdown guides from Obsidian export or generated guides."""
    total = 0
    if not root.exists():
        app_logger.warning(f"Directory not found: {root}")
        return 0

    for md_file in sorted(root.rglob("*.md")):
        try:
            rel = md_file.relative_to(root)
            category = rel.parts[0] if len(rel.parts) > 1 else "general"
            op_type = OPERATION_MAP.get(category, "general")

            content = md_file.read_text(encoding="utf-8")
            chunks = chunk_markdown(
                content,
                source=md_file.stem.replace("_", " "),
                operation_type=op_type,
            )
            if chunks:
                added = await add_documents(chunks)
                total += added
                app_logger.info(f"Indexed {md_file.name}: {added} chunks")
        except Exception as e:
            app_logger.error(f"Error indexing {md_file}: {e}")
    return total


async def main():
    setup_logging()
    app_logger.info("=== Creating ChromaDB embeddings ===")

    n1 = await index_json_files()
    n2 = await index_markdown_files(OBSIDIAN_ROOT)
    n3 = await index_markdown_files(GENERATED_ROOT)

    stats = get_stats()
    app_logger.info(
        f"Done — Added {n1+n2+n3} chunks total. "
        f"Collection now has {stats['document_count']} documents."
    )


if __name__ == "__main__":
    asyncio.run(main())
