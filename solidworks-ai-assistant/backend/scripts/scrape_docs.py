"""
Scrape SolidWorks Help documentation pages.
Usage: python scripts/scrape_docs.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.scraper import SEED_URLS, scrape_and_save

EXTRA_URLS = [
    # Sheet Metal
    "https://help.solidworks.com/2025/french/SolidWorks/sldworks/c_Sheet_Metal_Bend_Allowance.htm",
    "https://help.solidworks.com/2025/french/SolidWorks/sldworks/c_K-Factor_Overview.htm",
    "https://help.solidworks.com/2025/french/SolidWorks/sldworks/c_Flat_Pattern_Overview.htm",
    # Weldments
    "https://help.solidworks.com/2025/french/SolidWorks/sldworks/c_Structural_Members_Overview.htm",
    "https://help.solidworks.com/2025/french/SolidWorks/sldworks/c_Cut_List_Overview.htm",
]


async def main():
    all_urls = SEED_URLS + EXTRA_URLS
    print(f"Scraping {len(all_urls)} pages...")
    count = await scrape_and_save(all_urls, delay=1.5)
    print(f"Done — {count} pages saved to data/processed/")


if __name__ == "__main__":
    asyncio.run(main())
