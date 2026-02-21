from fastapi import FastAPI
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

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="AI-powered resume tailoring and job application toolkit",
)

# ── CORS ────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
