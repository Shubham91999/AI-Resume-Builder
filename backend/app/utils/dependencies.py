"""
Request-scoped helpers — extract API keys from headers, resolve active model, etc.
"""

from __future__ import annotations

from fastapi import Header, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from typing import Optional

from app.config import settings

_bearer = HTTPBearer(auto_error=False)


def not_found_error(resource: str, resource_id: str) -> HTTPException:
    """Return a standardized 404 HTTPException."""
    return HTTPException(status_code=404, detail=f"{resource} '{resource_id}' not found")


async def verify_download_access(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    """
    Verify download access when APP_SECRET_TOKEN is configured.

    If APP_SECRET_TOKEN is not set, access is unrestricted (single-user local mode).
    If it is set, the request must include: Authorization: Bearer <token>
    """
    if not settings.app_secret_token:
        return  # No token configured — open access (local single-user mode)
    if credentials is None or credentials.credentials != settings.app_secret_token:
        raise HTTPException(status_code=401, detail="Invalid or missing access token")


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
