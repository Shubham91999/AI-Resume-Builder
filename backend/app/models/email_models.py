from pydantic import BaseModel
from typing import Optional


class GeneratedEmail(BaseModel):
    """A single generated cold email."""

    target: str  # "recruiter" | "hiring_manager"
    subject: str
    body: str
    tips: list[str] = []


class EmailGenerateRequest(BaseModel):
    """Request to generate cold emails."""

    tailor_id: str
    provider: str = "groq"
    model_key: str = "llama-3.3-70b"


class EmailGenerateResponse(BaseModel):
    """Response containing both cold emails."""

    id: str
    tailor_id: str
    jd_id: str
    candidate_name: str
    job_title: str
    company: str
    recruiter_email: GeneratedEmail
    hiring_manager_email: GeneratedEmail
