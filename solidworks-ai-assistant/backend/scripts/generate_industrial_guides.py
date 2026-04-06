"""
Generate all industrial guides via GPT-4 Turbo and save to Obsidian export.
Usage: python scripts/generate_industrial_guides.py
"""
import asyncio
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.industrial_content_generator import GUIDE_TOPICS, generate_all_guides
from app.utils.logger import setup_logging, app_logger

OBSIDIAN_ROOT = Path("obsidian_export/Guides_Industriels")
GENERATED_ROOT = Path("data/industrial_guides")

CATEGORY_MAP = {
    "tolerie": "Tôlerie",
    "chaudronnerie": "Chaudronnerie",
    "structures": "Structures_Métalliques",
    "configuration_sw": "Configuration_SolidWorks",
}


async def main():
    setup_logging()
    app_logger.info(f"Generating {len(GUIDE_TOPICS)} industrial guides...")

    paths = await generate_all_guides()

    # Also copy to Obsidian export directory
    for path in paths:
        if path.exists():
            # Determine Obsidian category from slug
            parts = path.stem.split("/") if "/" in str(path.relative_to(GENERATED_ROOT)) else []
            rel = path.relative_to(GENERATED_ROOT)
            category_key = rel.parts[0] if len(rel.parts) > 1 else "general"
            obsidian_category = CATEGORY_MAP.get(category_key, category_key)

            dest_dir = OBSIDIAN_ROOT / obsidian_category
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / path.name
            shutil.copy2(path, dest)
            app_logger.info(f"Copied to Obsidian: {dest}")

    app_logger.info(f"Done — {len(paths)} guides generated.")


if __name__ == "__main__":
    asyncio.run(main())
