import logging

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.api import (
    jd_routes,
    resume_routes,
    tailor_routes,
    email_routes,
    download_routes,
    llm_routes,
    project_routes,
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="AI-powered resume tailoring and job application toolkit",
)

# ── CORS ────────────────────────────────────────────────────────────────────

_ALLOWED_METHODS = ["GET", "POST", "DELETE"]
_ALLOWED_HEADERS = [
    "Content-Type",
    "Authorization",
    "X-Provider",
    "X-Model-Key",
    "X-Groq-Key",
    "X-Google-Key",
    "X-OpenRouter-Key",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"] if settings.debug else _ALLOWED_METHODS,
    allow_headers=["*"] if settings.debug else _ALLOWED_HEADERS,
)

# ── Security Headers (production only) ─────────────────────────────────────


@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    if not settings.debug:
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
    return response


# ── Startup warning ─────────────────────────────────────────────────────────


@app.on_event("startup")
async def _startup_checks() -> None:
    if not settings.debug:
        logger.warning(
            "Running in PRODUCTION mode. Ensure the server is behind an HTTPS "
            "reverse proxy — API keys are transmitted in request headers and must "
            "be protected by TLS."
        )

# ── Routers ─────────────────────────────────────────────────────────────────

app.include_router(jd_routes.router, prefix="/api/jd", tags=["Job Description"])
app.include_router(resume_routes.router, prefix="/api/resumes", tags=["Resumes"])
app.include_router(tailor_routes.router, prefix="/api/tailor", tags=["Tailoring"])
app.include_router(email_routes.router, prefix="/api/emails", tags=["Cold Emails"])
app.include_router(download_routes.router, prefix="/api/download", tags=["Download"])
app.include_router(llm_routes.router, prefix="/api/llm", tags=["LLM"])
app.include_router(project_routes.router, prefix="/api/projects", tags=["Project Bank"])

# ── Health Check ────────────────────────────────────────────────────────────


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "app": settings.app_name, "version": "0.1.0"}
