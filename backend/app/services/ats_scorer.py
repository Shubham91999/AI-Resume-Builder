"""
ATS Scorer — score resumes against a parsed JD.

Scoring weights (from plan):
  - Required skills:      35%
  - Preferred skills:     15%
  - Title alignment:      20%
  - Experience relevance: 15%
  - Years experience fit: 10%
  - Education match:       5%

Also detects "knockout" alerts for critical missing required skills.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.models.jd_models import ParsedJD
from app.models.resume_models import ParsedResume
from app.models.score_models import (
    ScoreBreakdown,
    KnockoutAlert,
    ResumeScore,
    RankingResponse,
)
from app.utils.synonym_map import normalize_skill, find_matching_skill
from app.services.embedding_service import semantic_similarity, average_similarity

logger = logging.getLogger(__name__)

# ── Weights ──────────────────────────────────────────────────────────────────

WEIGHTS = {
    "required_skills": 0.35,
    "preferred_skills": 0.15,
    "title_alignment": 0.20,
    "experience_relevance": 0.15,
    "years_experience": 0.10,
    "education": 0.05,
}


# ── Public API ───────────────────────────────────────────────────────────────


def score_resume(jd: ParsedJD, resume: ParsedResume) -> ResumeScore:
    """Score a single resume against a parsed JD."""

    # 1. Required skills matching
    matched_required: list[str] = []
    missing_required: list[str] = []
    for skill in jd.required_skills:
        match = find_matching_skill(skill, resume.skills)
        if match:
            matched_required.append(skill)
        else:
            # Also check experience bullets and project bullets for keyword presence
            if _skill_in_text(skill, resume):
                matched_required.append(skill)
            else:
                missing_required.append(skill)

    required_pct = (len(matched_required) / max(len(jd.required_skills), 1)) * 100

    # 2. Preferred skills matching
    matched_preferred: list[str] = []
    for skill in jd.preferred_skills:
        match = find_matching_skill(skill, resume.skills)
        if match:
            matched_preferred.append(skill)
        elif _skill_in_text(skill, resume):
            matched_preferred.append(skill)

    preferred_pct = (len(matched_preferred) / max(len(jd.preferred_skills), 1)) * 100

    # 3. Title alignment
    title_pct = _title_similarity(jd.job_title, resume)

    # 4. Experience relevance — keyword coverage in experience bullets
    experience_pct = _experience_relevance(jd, resume)

    # 5. Years experience fit
    years_pct = _years_fit(jd.required_experience_years, resume)

    # 6. Education match
    education_pct = _education_match(jd.education, resume)

    # Weighted total
    overall = (
        required_pct * WEIGHTS["required_skills"]
        + preferred_pct * WEIGHTS["preferred_skills"]
        + title_pct * WEIGHTS["title_alignment"]
        + experience_pct * WEIGHTS["experience_relevance"]
        + years_pct * WEIGHTS["years_experience"]
        + education_pct * WEIGHTS["education"]
    )

    breakdown = ScoreBreakdown(
        required_skills_pct=round(required_pct, 1),
        preferred_skills_pct=round(preferred_pct, 1),
        title_similarity_pct=round(title_pct, 1),
        experience_relevance_pct=round(experience_pct, 1),
        years_experience_fit_pct=round(years_pct, 1),
        education_match_pct=round(education_pct, 1),
    )

    # Knockout alerts
    knockouts = _build_knockouts(missing_required)

    return ResumeScore(
        resume_id=resume.id,
        resume_name=resume.name,
        file_name=resume.file_name,
        overall_score=round(overall, 1),
        breakdown=breakdown,
        knockout_alerts=knockouts,
        matched_required_skills=matched_required,
        missing_required_skills=missing_required,
        matched_preferred_skills=matched_preferred,
    )


def rank_resumes(jd: ParsedJD, resumes: list[ParsedResume]) -> RankingResponse:
    """Score and rank all resumes against a JD."""
    scores = [score_resume(jd, r) for r in resumes]
    scores.sort(key=lambda s: s.overall_score, reverse=True)

    top_id = scores[0].resume_id if scores else ""

    return RankingResponse(
        jd_id=jd.id,
        rankings=scores,
        top_resume_id=top_id,
    )


# ── Scoring Helpers ──────────────────────────────────────────────────────────


def _skill_in_text(skill: str, resume: ParsedResume) -> bool:
    """Check if a skill appears anywhere in the resume text (experience, projects, summary)."""
    skill_lower = skill.lower()
    norm = normalize_skill(skill)

    # Build a big text blob from resume content
    text_parts: list[str] = []
    if resume.summary:
        text_parts.append(resume.summary)
    if resume.tagline:
        text_parts.append(resume.tagline)

    for exp in resume.experience:
        text_parts.append(exp.title)
        text_parts.append(exp.company)
        text_parts.extend(exp.bullets)

    for proj in resume.projects:
        text_parts.append(proj.name)
        text_parts.extend(proj.technologies)
        text_parts.extend(proj.bullets)

    text_parts.extend(resume.certifications)
    full_text = " ".join(text_parts).lower()

    # Direct substring match
    if skill_lower in full_text:
        return True

    # Normalized match
    if norm in full_text:
        return True

    # Check word boundaries for short skills (e.g., "go", "r")
    if len(skill_lower) <= 3:
        pattern = r"\b" + re.escape(skill_lower) + r"\b"
        if re.search(pattern, full_text):
            return True

    return False


def _title_similarity(jd_title: str, resume: ParsedResume) -> float:
    """
    Score how well the candidate's most recent title matches the JD title.
    Uses a blend of keyword overlap (40%) and semantic similarity (60%).
    Falls back to keyword-only if embeddings are unavailable.
    """
    if not resume.experience:
        return 20.0  # Small baseline for having any resume

    jd_words = _extract_title_words(jd_title)
    if not jd_words:
        return 50.0  # Can't score if no JD title

    # ── Keyword overlap score ──
    keyword_score = 0.0
    for exp in resume.experience[:2]:
        resume_words = _extract_title_words(exp.title)
        if not resume_words:
            continue
        overlap = len(jd_words & resume_words) / len(jd_words)
        keyword_score = max(keyword_score, overlap * 100)

    if resume.tagline:
        tagline_words = _extract_title_words(resume.tagline)
        overlap = len(jd_words & tagline_words) / max(len(jd_words), 1)
        keyword_score = max(keyword_score, overlap * 80)

    keyword_score = min(keyword_score, 100.0)

    # ── Semantic similarity score ──
    candidate_titles = [exp.title for exp in resume.experience[:2] if exp.title]
    if resume.tagline:
        candidate_titles.append(resume.tagline)

    semantic_score: float | None = None
    if candidate_titles:
        best_sim = 0.0
        for title in candidate_titles:
            sim = semantic_similarity(jd_title, title)
            if sim is not None:
                best_sim = max(best_sim, sim)
        if best_sim > 0.0:
            semantic_score = best_sim * 100  # Scale to 0-100

    # Blend: 60% semantic + 40% keyword (fallback to keyword-only)
    if semantic_score is not None:
        return min(semantic_score * 0.6 + keyword_score * 0.4, 100.0)
    return keyword_score


def _extract_title_words(title: str) -> set[str]:
    """Extract meaningful words from a job title, normalized."""
    stop_words = {
        "a", "an", "the", "and", "or", "of", "in", "at", "for", "to",
        "with", "on", "by", "is", "are", "was", "were", "be", "been",
        "-", "/", "|", "&", ",", ".", "(", ")", "i", "ii", "iii", "iv", "v",
    }
    words = set()
    for word in re.split(r"[\s/|,\-&]+", title.lower()):
        word = word.strip()
        if word and word not in stop_words and len(word) > 1:
            words.add(normalize_skill(word))
    return words


def _experience_relevance(jd: ParsedJD, resume: ParsedResume) -> float:
    """
    Score how relevant the resume experience is to the JD.
    Uses a blend of keyword coverage (50%) and semantic similarity (50%).
    Falls back to keyword-only if embeddings are unavailable.
    """
    if not resume.experience:
        return 0.0

    # Collect all JD keywords
    jd_keywords: set[str] = set()
    for kw in jd.keywords_to_match:
        jd_keywords.add(kw.lower())
    for skill in jd.required_skills + jd.preferred_skills:
        jd_keywords.add(skill.lower())

    if not jd_keywords:
        return 50.0

    # Collect all experience text
    exp_text_parts: list[str] = []
    for exp in resume.experience:
        exp_text_parts.append(exp.title.lower())
        exp_text_parts.extend(b.lower() for b in exp.bullets)
    exp_text = " ".join(exp_text_parts)

    # ── Keyword coverage score ──
    hits = sum(1 for kw in jd_keywords if kw in exp_text)
    coverage = hits / len(jd_keywords)
    keyword_score = min(coverage * 100, 100.0)

    # ── Semantic similarity score ──
    # Compare JD responsibilities against resume experience bullets
    jd_context = " ".join(jd.key_responsibilities) if jd.key_responsibilities else ""
    if not jd_context:
        jd_context = " ".join(jd.keywords_to_match)

    semantic_score: float | None = None
    if jd_context and exp_text:
        sim = semantic_similarity(jd_context, exp_text)
        if sim is not None:
            semantic_score = sim * 100

    # Blend: 50% semantic + 50% keyword (fallback to keyword-only)
    if semantic_score is not None:
        return min(semantic_score * 0.5 + keyword_score * 0.5, 100.0)
    return keyword_score


def _years_fit(required_years: int | None, resume: ParsedResume) -> float:
    """Score how well the candidate's experience years match the requirement."""
    if required_years is None:
        return 70.0  # No requirement → decent default

    # Estimate years from experience entries
    estimated_years = _estimate_years(resume)

    if estimated_years is None:
        return 50.0  # Can't estimate → neutral

    if estimated_years >= required_years:
        return 100.0
    elif estimated_years >= required_years * 0.7:
        # Close enough (e.g., 3.5 years for 5 year requirement)
        ratio = estimated_years / required_years
        return ratio * 100
    else:
        ratio = estimated_years / required_years
        return max(ratio * 80, 10.0)  # Floor at 10%


def _estimate_years(resume: ParsedResume) -> float | None:
    """
    Rough estimation of total years of experience from resume dates.
    Looks for year ranges in experience entries.
    """
    if not resume.experience:
        return None

    total_years = 0.0
    for exp in resume.experience:
        years = _parse_date_range_years(exp.dates)
        if years:
            total_years += years

    return total_years if total_years > 0 else None


def _parse_date_range_years(dates: str) -> float | None:
    """Parse a date range string and return approximate years."""
    if not dates:
        return None

    dates_lower = dates.lower()

    # Extract years
    years = re.findall(r"20\d{2}|19\d{2}", dates)
    if len(years) >= 2:
        return max(0.5, int(years[-1]) - int(years[0]))

    if "present" in dates_lower or "current" in dates_lower:
        if len(years) >= 1:
            from datetime import datetime
            current_year = datetime.now().year
            return max(0.5, current_year - int(years[0]))

    if len(years) == 1:
        return 1.0  # Single year, assume ~1 year

    return None


def _education_match(jd_education: str | None, resume: ParsedResume) -> float:
    """Score education match."""
    if not jd_education:
        return 70.0  # No requirement

    if not resume.education:
        return 20.0  # Has requirement but no education listed

    jd_ed_lower = jd_education.lower()

    # Check for degree level keywords
    degree_keywords = {
        "phd": 100, "doctorate": 100, "ph.d": 100,
        "master": 90, "ms": 90, "m.s.": 90, "mba": 90,
        "bachelor": 80, "bs": 80, "b.s.": 80, "ba": 80, "b.a.": 80,
    }

    # Find highest degree in resume
    resume_degree_score = 0
    for edu in resume.education:
        edu_lower = edu.degree.lower()
        for keyword, score in degree_keywords.items():
            if keyword in edu_lower:
                resume_degree_score = max(resume_degree_score, score)

    # Find required degree level
    required_score = 0
    for keyword, score in degree_keywords.items():
        if keyword in jd_ed_lower:
            required_score = max(required_score, score)

    if required_score == 0:
        return 70.0  # Can't parse requirement

    if resume_degree_score >= required_score:
        return 100.0
    elif resume_degree_score > 0:
        return 60.0  # Has some education, just not the right level
    else:
        return 30.0


def _build_knockouts(missing_required: list[str]) -> list[KnockoutAlert]:
    """Build knockout alerts for missing required skills."""
    alerts: list[KnockoutAlert] = []
    for skill in missing_required:
        severity = "critical" if len(missing_required) > len(missing_required) * 0.5 else "warning"
        # If more than half of required skills are missing, everything is critical
        alerts.append(KnockoutAlert(
            skill=skill,
            severity="critical" if len(missing_required) >= 3 else "warning",
            message=f"Required skill '{skill}' not found in resume",
        ))
    return alerts
