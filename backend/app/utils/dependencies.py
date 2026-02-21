"""
Request-scoped helpers — extract API keys from headers, resolve active model, etc.
"""

from __future__ import annotations

from fastapi import Header
from typing import Optional


class APIKeys:
    """Container for per-request API keys extracted from headers."""

    def __init__(
        self,
        groq: str | None = None,
        google: str | None = None,
        openrouter: str | None = None,
    ):
        self.groq = groq
        self.google = google
        self.openrouter = openrouter

    def get_key(self, provider: str) -> str | None:
        """Get the key for a specific provider."""
        return getattr(self, provider, None)

    def has_any(self) -> bool:
        return bool(self.groq or self.google or self.openrouter)

    def available_providers(self) -> list[str]:
        providers = []
        if self.groq:
            providers.append("groq")
        if self.google:
            providers.append("google")
        if self.openrouter:
            providers.append("openrouter")
        return providers


async def get_api_keys(
    x_groq_key: Optional[str] = Header(None, alias="X-Groq-Key"),
    x_google_key: Optional[str] = Header(None, alias="X-Google-Key"),
    x_openrouter_key: Optional[str] = Header(None, alias="X-OpenRouter-Key"),
) -> APIKeys:
    """FastAPI dependency that extracts API keys from request headers."""
    return APIKeys(
        groq=x_groq_key or None,
        google=x_google_key or None,
        openrouter=x_openrouter_key or None,
    )
