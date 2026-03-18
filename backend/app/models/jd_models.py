from datetime import datetime
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional
from enum import Enum


class JDType(str, Enum):
    """Classification of job description type."""

    JAVA_BACKEND = "java_backend"
    PYTHON_BACKEND = "python_backend"
    AI_ML = "ai_ml"
    FRONTEND = "frontend"
    FULLSTACK = "fullstack"
    NEW_GRAD = "new_grad"


# ── Request Models ──────────────────────────────────────────────────────────


class JDUrlInput(BaseModel):
    """Input for parsing a JD from a URL."""

    url: HttpUrl
    provider: str
    model_key: str


class JDTextInput(BaseModel):
    """Input for parsing raw JD text."""

    text: str
    provider: str
    model_key: str


class JDPatch(BaseModel):
    """Fields that can be manually corrected after LLM parsing."""

    job_title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    required_skills: Optional[list[str]] = None
    preferred_skills: Optional[list[str]] = None
    keywords_to_match: Optional[list[str]] = None
    required_experience_years: Optional[int] = None


# ── Response Models ─────────────────────────────────────────────────────────


class ParsedJD(BaseModel):
    """Structured output from JD parsing."""

    id: str
    job_title: str
    company: str
    location: Optional[str] = None
    jd_type: JDType
    required_skills: list[str]
    preferred_skills: list[str]
    required_experience_years: Optional[int] = None
    education: Optional[str] = None
    key_responsibilities: list[str]
    keywords_to_match: list[str]
    raw_text: str
    created_at: datetime = Field(default_factory=datetime.now)
