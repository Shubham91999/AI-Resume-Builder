"""
JD Service — parse job descriptions from text or URLs.

Responsibilities:
  • Parse raw JD text via LLM → structured ParsedJD
  • Scrape JD from URL via Playwright → raw text → LLM parse
  • Assign unique IDs, cache results in memory for the session
"""

from __future__ import annotations

import logging
import uuid
import asyncio
from typing import Any

from app.models.jd_models import JDType, ParsedJD
from app.prompts.jd_parser import SYSTEM_PROMPT, USER_PROMPT_TEMPLATE
from app.services.llm_service import complete_json

logger = logging.getLogger(__name__)

# In-memory JD cache (session-scoped, lost on restart — fine for MVP)
_jd_cache: dict[str, ParsedJD] = {}


# ── Public API ───────────────────────────────────────────────────────────────


async def parse_jd_text(
    *,
    text: str,
    provider: str,
    model_key: str,
    api_key: str,
) -> ParsedJD:
    """Parse raw JD text into structured ParsedJD via LLM."""
    if not text.strip():
        raise ValueError("JD text cannot be empty")

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": USER_PROMPT_TEMPLATE.format(jd_text=text.strip())},
    ]

    logger.info(f"Parsing JD text ({len(text)} chars) with {provider}/{model_key}")

    data = await complete_json(
        provider=provider,
        model_key=model_key,
        api_key=api_key,
        messages=messages,
        prompt_name="jd_parser",
    )

    parsed = _build_parsed_jd(data, raw_text=text.strip())
    _jd_cache[parsed.id] = parsed
    logger.info(f"Parsed JD: id={parsed.id} title={parsed.job_title} company={parsed.company}")
    return parsed


async def parse_jd_url(
    *,
    url: str,
    provider: str,
    model_key: str,
    api_key: str,
) -> ParsedJD:
    """Scrape a job URL with Playwright, then parse the text via LLM."""
    logger.info(f"Scraping JD from URL: {url}")
    raw_text = await _scrape_url(url)

    if not raw_text or len(raw_text.strip()) < 50:
        raise ValueError(
            "Could not extract meaningful text from the URL. "
            "Try pasting the job description text directly instead."
        )

    return await parse_jd_text(
        text=raw_text,
        provider=provider,
        model_key=model_key,
        api_key=api_key,
    )


def get_cached_jd(jd_id: str) -> ParsedJD | None:
    """Retrieve a previously parsed JD by ID."""
    return _jd_cache.get(jd_id)


def list_cached_jds() -> list[ParsedJD]:
    """Return all cached parsed JDs."""
    return list(_jd_cache.values())


# ── URL Scraping ─────────────────────────────────────────────────────────────


async def _scrape_url(url: str) -> str:
    """
    Scrape a job listing page using Playwright.
    Falls back to a simple httpx fetch if Playwright is not available.
    """
    try:
        return await _scrape_with_playwright(url)
    except Exception as e:
        logger.warning(f"Playwright scrape failed: {e}. Falling back to httpx.")
        return await _scrape_with_httpx(url)


async def _scrape_with_playwright(url: str) -> str:
    """Scrape with Playwright (handles JS-rendered pages like LinkedIn, Greenhouse)."""
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.goto(url, wait_until="networkidle", timeout=30000)

            # Wait a bit for dynamic content
            await asyncio.sleep(2)

            # Try common job description selectors first
            selectors = [
                '[class*="job-description"]',
                '[class*="jobDescription"]',
                '[class*="job_description"]',
                '[id*="job-description"]',
                '[id*="jobDescription"]',
                '[class*="description__text"]',
                '[class*="posting-page"]',
                'article',
                '[role="main"]',
                'main',
            ]

            for selector in selectors:
                try:
                    el = await page.query_selector(selector)
                    if el:
                        text = await el.inner_text()
                        if len(text.strip()) > 100:
                            logger.info(f"Scraped via selector '{selector}': {len(text)} chars")
                            return text.strip()
                except Exception:
                    continue

            # Fallback: get all body text
            body = await page.query_selector("body")
            if body:
                text = await body.inner_text()
                return text.strip()

            return ""
        finally:
            await browser.close()


async def _scrape_with_httpx(url: str) -> str:
    """Simple fallback scraper using httpx + basic HTML parsing."""
    import httpx
    from html.parser import HTMLParser

    class TextExtractor(HTMLParser):
        def __init__(self) -> None:
            super().__init__()
            self.text_parts: list[str] = []
            self._skip = False

        def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
            self._skip = tag in ("script", "style", "noscript")

        def handle_endtag(self, tag: str) -> None:
            if tag in ("script", "style", "noscript"):
                self._skip = False

        def handle_data(self, data: str) -> None:
            if not self._skip:
                stripped = data.strip()
                if stripped:
                    self.text_parts.append(stripped)

    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        resp = await client.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        })
        resp.raise_for_status()

    parser = TextExtractor()
    parser.feed(resp.text)
    return "\n".join(parser.text_parts)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _build_parsed_jd(data: dict | list, raw_text: str) -> ParsedJD:
    """Build a ParsedJD from LLM JSON output, with safe defaults."""
    if isinstance(data, list):
        data = data[0] if data else {}

    d: dict[str, Any] = data  # type: ignore

    return ParsedJD(
        id=str(uuid.uuid4()),
        job_title=d.get("job_title", "Unknown Title"),
        company=d.get("company", "Unknown"),
        location=d.get("location"),
        jd_type=_safe_jd_type(d.get("jd_type", "fullstack")),
        required_skills=_ensure_list(d.get("required_skills")),
        preferred_skills=_ensure_list(d.get("preferred_skills")),
        required_experience_years=_safe_int(d.get("required_experience_years")),
        education=d.get("education"),
        key_responsibilities=_ensure_list(d.get("key_responsibilities")),
        keywords_to_match=_ensure_list(d.get("keywords_to_match")),
        raw_text=raw_text,
    )


def _safe_jd_type(val: str) -> JDType:
    """Ensure the JD type is a valid enum value."""
    try:
        return JDType(val)
    except ValueError:
        return JDType.FULLSTACK


def _ensure_list(val: Any) -> list[str]:
    """Ensure the value is a list of strings."""
    if isinstance(val, list):
        return [str(v) for v in val]
    if isinstance(val, str):
        return [val]
    return []


def _safe_int(val: Any) -> int | None:
    """Parse an integer safely, returning None on failure."""
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
