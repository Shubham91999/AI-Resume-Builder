from pydantic import BaseModel
from typing import Optional


# ── Tailored Section Models ─────────────────────────────────────────────────


class TailoredTagline(BaseModel):
    """Tailored tagline output."""

    tagline: str


class TailoredSummary(BaseModel):
    """Tailored summary output."""

    summary: str


class TailoredSkills(BaseModel):
    """Tailored skills section output."""

    skills: dict[str, str]  # category -> comma-separated skills
    added_from_jd: list[str]
    removed: list[str]


class TailoredExperienceEntry(BaseModel):
    """Tailored experience entry output."""

    company: str
    title: str
    dates: str
    bullets: list[str]
    keywords_used: list[str]


class SelectedProject(BaseModel):
    """A project selected from the bank for this JD."""

    name: str
    score: float
    reason: str
    bullets: list[str]


class ProjectSelectionResult(BaseModel):
    """Output from project selection prompt."""

    rankings: list[dict]  # all projects scored
    selected: list[SelectedProject]  # top 2


# ── Combined Tailored Resume ───────────────────────────────────────────────


class TailoredResume(BaseModel):
    """Complete tailored resume content."""

    id: str
    jd_id: str
    original_resume_id: str
    name: str
    contact: dict
    tagline: str
    summary: str
    skills: dict[str, str]
    experience: list[TailoredExperienceEntry]
    projects: list[SelectedProject]
    education: list[dict]
    certifications: list[str]
    skills_added: list[str]
    skills_removed: list[str]
    keywords_used: list[str] = []  # JD keywords found in tailored resume
    keywords_coverage: float  # percentage of JD keywords present


# ── Request Models ──────────────────────────────────────────────────────────


class TailorRequest(BaseModel):
    """Request to tailor a resume for a JD."""

    jd_id: str
    resume_id: str
    provider: str = "groq"
    model_key: str = "llama-3.3-70b"


class TailorProgress(BaseModel):
    """Progress update during tailoring pipeline."""

    step: str  # current step name
    step_number: int  # 1-based
    total_steps: int
    status: str  # "in_progress" | "completed" | "failed"
    message: Optional[str] = None
