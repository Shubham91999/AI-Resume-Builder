from pydantic import BaseModel
from typing import Optional


class ScoreBreakdown(BaseModel):
    """Detailed breakdown of ATS score components."""

    required_skills_pct: float  # 0-100
    preferred_skills_pct: float  # 0-100
    title_similarity_pct: float  # 0-100
    experience_relevance_pct: float  # 0-100
    years_experience_fit_pct: float  # 0-100
    education_match_pct: float  # 0-100


class KnockoutAlert(BaseModel):
    """A missing required skill or qualification."""

    skill: str
    severity: str  # "critical" | "warning"
    message: str


class ResumeScore(BaseModel):
    """ATS score for a single resume against a JD."""

    resume_id: str
    resume_name: str
    file_name: str
    overall_score: float  # 0-100 weighted
    breakdown: ScoreBreakdown
    knockout_alerts: list[KnockoutAlert] = []
    matched_required_skills: list[str] = []
    missing_required_skills: list[str] = []
    matched_preferred_skills: list[str] = []


class RankingResponse(BaseModel):
    """Response with all resumes ranked."""

    jd_id: str
    rankings: list[ResumeScore]
    top_resume_id: str  # Auto-selected best match


class ScoreComparison(BaseModel):
    """Before/after ATS score comparison."""

    before: ResumeScore
    after: ResumeScore
    improvement_pct: float
    keywords_added: list[str]
