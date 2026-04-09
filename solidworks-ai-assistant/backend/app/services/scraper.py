"""
SolidWorks Help documentation scraper.
Saves raw HTML → data/raw/, cleaned text → data/processed/.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path
from typing import List, Optional
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.utils.logger import get_logger

logger = get_logger("ctm.scraper")

RAW_DIR = Path("data/raw")
PROCESSED_DIR = Path("data/processed")
RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# SolidWorks Help sections relevant to CTM
SEED_URLS = [
    "https://help.solidworks.com/2025/french/SolidWorks/sldworks/c_Sheet_Metal_Overview.htm",
    "https://help.solidworks.com/2025/french/SolidWorks/sldworks/c_Weldments_Overview.htm",
    "https://help.solidworks.com/2025/french/SolidWorks/sldworks/c_Assembly_Overview.htm",
]


def _clean_html(html: str, url: str) -> Optional[dict]:
    """Extract title + clean text from SolidWorks Help HTML."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove nav, scripts, styles
    for tag in soup.select("nav, script, style, footer, .breadcrumb, #toc"):
        tag.decompose()

    title_tag = soup.find("h1") or soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else urlparse(url).path

    content_div = soup.find("div", {"id": "mainContent"}) or soup.find("article") or soup.body
    if not content_div:
        return None

    text = content_div.get_text(separator="\n", strip=True)
    # Collapse excessive whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)

    if len(text) < 100:
        return None

    return {"url": url, "title": title, "content": text}


async def scrape_page(client: httpx.AsyncClient, url: str, delay: float = 1.0) -> Optional[dict]:
    """Fetch a single page and return cleaned data."""
    try:
        resp = await client.get(url, timeout=15.0)
        if resp.status_code != 200:
            logger.warning(f"HTTP {resp.status_code}: {url}")
            return None
        await asyncio.sleep(delay)
        return _clean_html(resp.text, url)
    except Exception as e:
        logger.error(f"Scrape error {url}: {e}")
        return None


async def scrape_and_save(urls: List[str], delay: float = 1.5) -> int:
    """Scrape a list of URLs and save to disk. Returns count saved."""
    saved = 0
    headers = {
        "User-Agent": "CTM-Industrie-Assistant/1.0 (educational use)",
        "Accept-Language": "fr-FR,fr;q=0.9",
    }

    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        for i, url in enumerate(urls):
            slug = re.sub(r"[^\w]", "_", urlparse(url).path)[:80]
            raw_path = RAW_DIR / f"{slug}.html"
            proc_path = PROCESSED_DIR / f"{slug}.json"

            if proc_path.exists():
                logger.debug(f"Skip (cached): {url}")
                continue

            logger.info(f"[{i+1}/{len(urls)}] Scraping: {url}")
            data = await scrape_page(client, url, delay)

            if data:
                proc_path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                saved += 1

    logger.info(f"Scraping complete: {saved} pages saved")
    return saved
