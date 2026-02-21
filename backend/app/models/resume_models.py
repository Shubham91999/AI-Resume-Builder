from pydantic import BaseModel
from typing import Optional


# ── Sub-Models ──────────────────────────────────────────────────────────────


class ContactInfo(BaseModel):
    """Candidate contact information."""

    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    location: Optional[str] = None


class ExperienceEntry(BaseModel):
    """A single work experience entry."""

    title: str
    company: str
    dates: str
    bullets: list[str]


class ProjectEntry(BaseModel):
    """A single project entry."""

    name: str
    technologies: list[str] = []
    bullets: list[str]


class EducationEntry(BaseModel):
    """A single education entry."""

    degree: str
    school: str
    year: Optional[str] = None


# ── Main Resume Model ──────────────────────────────────────────────────────


class ParsedResume(BaseModel):
    """Structured output from resume parsing."""

    id: str
    file_name: str
    file_hash: str
    source: str  # "local_upload" | "google_drive"
    drive_file_id: Optional[str] = None
    name: str
    contact: ContactInfo
    tagline: Optional[str] = None
    summary: Optional[str] = None
    skills: list[str] = []
    experience: list[ExperienceEntry] = []
    projects: list[ProjectEntry] = []
    education: list[EducationEntry] = []
    certifications: list[str] = []
    raw_text: str


# ── Project Bank Models ─────────────────────────────────────────────────────


class ProjectBankEntry(BaseModel):
    """A project in the user's project bank."""

    id: str
    name: str
    bullets: list[str]
    skills: list[str]


class ProjectBankCreate(BaseModel):
    """Input for creating a new project bank entry."""

    name: str
    bullets: list[str]
    skills: list[str]


class ProjectBankUpdate(BaseModel):
    """Input for updating a project bank entry."""

    name: Optional[str] = None
    bullets: Optional[list[str]] = None
    skills: Optional[list[str]] = None
