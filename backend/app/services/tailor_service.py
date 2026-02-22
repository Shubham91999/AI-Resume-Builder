"""
Tailor Service — orchestrate section-by-section resume tailoring via LLM.

Pipeline steps:
  1. Tailor tagline
  2. Rewrite summary
  3. Optimize skills
  4. Rewrite experience bullets (per role)
  5. Compute keyword coverage

Each step calls the LLM with a dedicated prompt and validates the JSON output.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.models.jd_models import ParsedJD
from app.models.resume_models import ParsedResume
from app.models.tailor_models import (
    TailoredResume,
    TailoredExperienceEntry,
)
from app.prompts import tailor_tagline, tailor_summary, tailor_skills, tailor_experience
from app.services.llm_service import complete_json
from app.services.project_service import select_projects_for_jd

logger = logging.getLogger(__name__)

# In-memory cache for tailored resumes
_tailor_cache: dict[str, TailoredResume] = {}


# ── Public API ───────────────────────────────────────────────────────────────


async def tailor_resume(
    *,
    jd: ParsedJD,
    resume: ParsedResume,
    provider: str,
    model_key: str,
    api_key: str,
    progress_callback: Any = None,
) -> TailoredResume:
    """
    Run the full tailoring pipeline.

    Args:
        jd: Parsed job description
        resume: Parsed resume (original)
        provider: LLM provider key
        model_key: LLM model key
        api_key: User's API key
        progress_callback: Optional async callable(step_name, step_num, total, status, message)
    """
    total_steps = 4 + len(resume.experience)  # tagline + summary + skills + N experience entries

    async def _progress(step: str, num: int, status: str = "in_progress", msg: str | None = None):
        if progress_callback:
            try:
                await progress_callback(step, num, total_steps, status, msg)
            except Exception as exc:
                logger.warning("Progress callback failed at step '%s': %s", step, exc)

    # Helper for JD context strings
    jd_required = ", ".join(jd.required_skills)
    jd_preferred = ", ".join(jd.preferred_skills)
    jd_keywords = ", ".join(jd.keywords_to_match)
    jd_responsibilities = "; ".join(jd.key_responsibilities[:5])

    step_num = 0

    # ── Step 1: Tagline ──────────────────────────────────────────────────
    step_num += 1
    await _progress("Tailoring tagline", step_num)
    logger.info("Tailoring step 1: tagline")

    tagline_data = await complete_json(
        provider=provider,
        model_key=model_key,
        api_key=api_key,
        messages=[
            {"role": "system", "content": tailor_tagline.SYSTEM_PROMPT},
            {"role": "user", "content": tailor_tagline.USER_PROMPT_TEMPLATE.format(
                job_title=jd.job_title,
                company=jd.company,
                jd_type=jd.jd_type.value,
                required_skills=jd_required,
                key_responsibilities=jd_responsibilities,
                keywords=jd_keywords,
                current_tagline=resume.tagline or "N/A",
            )},
        ],
        prompt_name="tailor_tagline",
    )
    new_tagline = _safe_str(tagline_data, "tagline", resume.tagline or "")
    await _progress("Tailoring tagline", step_num, "completed")

    # ── Step 2: Summary ──────────────────────────────────────────────────
    step_num += 1
    await _progress("Rewriting summary", step_num)
    logger.info("Tailoring step 2: summary")

    # Compute years in Python — deterministic, never delegated to the LLM.
    actual_years = _calculate_experience_years(resume)
    years_display = _resolve_years_display(actual_years, jd.required_experience_years)
    logger.info(
        "Experience years — actual: %.1f, JD requires: %s, display: %s",
        actual_years, jd.required_experience_years, years_display,
    )

    # Build experience highlights so the LLM has real metrics/achievements to cite.
    highlight_lines: list[str] = []
    for exp in resume.experience:
        role_header = f"{exp.title} at {exp.company} ({exp.dates}):"
        highlight_lines.append(role_header)
        highlight_lines.extend(f"  - {b}" for b in exp.bullets[:3])
    experience_highlights = "\n".join(highlight_lines) if highlight_lines else "N/A"

    summary_data = await complete_json(
        provider=provider,
        model_key=model_key,
        api_key=api_key,
        messages=[
            {"role": "system", "content": tailor_summary.SYSTEM_PROMPT},
            {"role": "user", "content": tailor_summary.USER_PROMPT_TEMPLATE.format(
                job_title=jd.job_title,
                company=jd.company,
                required_skills=jd_required,
                preferred_skills=jd_preferred,
                key_responsibilities=jd_responsibilities,
                keywords=jd_keywords,
                years_display=years_display,
                current_summary=resume.summary or "No existing summary",
                candidate_skills=", ".join(resume.skills[:20]),
                experience_highlights=experience_highlights,
            )},
        ],
        prompt_name="tailor_summary",
    )
    new_summary = _safe_str(summary_data, "summary", resume.summary or "")
    await _progress("Rewriting summary", step_num, "completed")

    # ── Step 3: Skills ───────────────────────────────────────────────────
    step_num += 1
    await _progress("Optimizing skills", step_num)
    logger.info("Tailoring step 3: skills")

    skills_data = await complete_json(
        provider=provider,
        model_key=model_key,
        api_key=api_key,
        messages=[
            {"role": "system", "content": tailor_skills.SYSTEM_PROMPT},
            {"role": "user", "content": tailor_skills.USER_PROMPT_TEMPLATE.format(
                job_title=jd.job_title,
                required_skills=jd_required,
                preferred_skills=jd_preferred,
                keywords=jd_keywords,
                current_skills=", ".join(resume.skills),
            )},
        ],
        prompt_name="tailor_skills",
    )

    new_skills: dict[str, str] = {}
    if isinstance(skills_data, dict) and "skills" in skills_data:
        raw_skills = skills_data["skills"]
        if isinstance(raw_skills, dict):
            new_skills = {str(k): str(v) for k, v in raw_skills.items()}
    if not new_skills:
        # Fallback: put all skills in one category
        new_skills = {"Technical Skills": ", ".join(resume.skills)}

    skills_added = _safe_list(skills_data, "added_from_jd") if isinstance(skills_data, dict) else []
    skills_removed = _safe_list(skills_data, "removed") if isinstance(skills_data, dict) else []
    await _progress("Optimizing skills", step_num, "completed")

    # ── Step 4+: Experience (one LLM call per role) ──────────────────────
    tailored_experience: list[TailoredExperienceEntry] = []

    for i, exp in enumerate(resume.experience):
        step_num += 1
        role_label = f"Rewriting: {exp.title} @ {exp.company}"
        await _progress(role_label, step_num)
        logger.info(f"Tailoring step {step_num}: experience #{i + 1} — {exp.title}")

        max_bullets = 4 if i == 0 else 3 if i == 1 else 2
        bullets_text = "\n".join(f"- {b}" for b in exp.bullets)

        sys_prompt = tailor_experience.SYSTEM_PROMPT_TEMPLATE.format(
            jd_type=jd.jd_type.value,
        )

        exp_data = await complete_json(
            provider=provider,
            model_key=model_key,
            api_key=api_key,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": tailor_experience.USER_PROMPT_TEMPLATE.format(
                    job_title=jd.job_title,
                    jd_type=jd.jd_type.value,
                    required_skills=jd_required,
                    keywords=jd_keywords,
                    exp_title=exp.title,
                    exp_company=exp.company,
                    exp_dates=exp.dates,
                    exp_bullets=bullets_text,
                    role_index=i + 1,
                    max_bullets=max_bullets,
                )},
            ],
            prompt_name="tailor_experience",
        )

        if isinstance(exp_data, dict):
            tailored_experience.append(TailoredExperienceEntry(
                company=exp_data.get("company", exp.company),
                title=exp_data.get("title", exp.title),
                dates=exp_data.get("dates", exp.dates),
                bullets=_safe_list(exp_data, "bullets") or exp.bullets,
                keywords_used=_safe_list(exp_data, "keywords_used"),
            ))
        else:
            # Fallback: keep original
            tailored_experience.append(TailoredExperienceEntry(
                company=exp.company,
                title=exp.title,
                dates=exp.dates,
                bullets=exp.bullets,
                keywords_used=[],
            ))

        await _progress(role_label, step_num, "completed")

    # ── Compute keyword coverage ─────────────────────────────────────────
    all_tailored_text = _build_full_text(new_tagline, new_summary, new_skills, tailored_experience)
    coverage = _compute_keyword_coverage(jd.keywords_to_match, all_tailored_text)
    keywords_used = [kw for kw in jd.keywords_to_match if kw.lower() in all_tailored_text.lower()]

    # ── Select best projects from bank ───────────────────────────────────
    selected_projects = select_projects_for_jd(jd, top_n=2)

    # ── Build result ─────────────────────────────────────────────────────
    tailored = TailoredResume(
        id=str(uuid.uuid4()),
        jd_id=jd.id,
        original_resume_id=resume.id,
        name=resume.name,
        contact=resume.contact.model_dump(),
        tagline=new_tagline,
        summary=new_summary,
        skills=new_skills,
        experience=tailored_experience,
        projects=selected_projects,
        education=[e.model_dump() for e in resume.education],
        certifications=resume.certifications,
        skills_added=skills_added,
        skills_removed=skills_removed,
        keywords_used=keywords_used,
        keywords_coverage=round(coverage, 1),
    )

    _tailor_cache[tailored.id] = tailored
    logger.info(
        f"Tailoring complete: id={tailored.id} coverage={coverage:.1f}% "
        f"skills_added={len(skills_added)} experience_entries={len(tailored_experience)}"
    )
    return tailored


def get_cached_tailored(tailor_id: str) -> TailoredResume | None:
    """Retrieve a cached tailored resume by ID."""
    return _tailor_cache.get(tailor_id)


def list_cached_tailored() -> list[TailoredResume]:
    """Return all cached tailored resumes."""
    return list(_tailor_cache.values())


# ── Helpers ──────────────────────────────────────────────────────────────────


def _safe_str(data: dict | list, key: str, default: str) -> str:
    """Safely extract a string from LLM output."""
    if isinstance(data, dict):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return default


def _safe_list(data: dict, key: str) -> list[str]:
    """Safely extract a list of strings from LLM output."""
    val = data.get(key, [])
    if isinstance(val, list):
        return [str(v) for v in val]
    return []


_MONTH_MAP: dict[str, int] = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    # seasons — map to rough mid-point month
    "spring": 3, "summer": 6, "fall": 9, "autumn": 9, "winter": 12,
}


def _parse_month_year(token: str) -> "date | None":
    """Parse a date token such as 'Jan 2022', 'January 2022', '2022', or 'Present'."""
    import re
    from datetime import date

    token = token.strip().lower()
    if token in ("present", "current", "now", "ongoing", "today"):
        return date.today()

    # "Month YYYY" or "MonthName YYYY"
    m = re.match(r"([a-z]+)\s+(\d{4})", token)
    if m:
        month = _MONTH_MAP.get(m.group(1)[:3])
        if month:
            return date(int(m.group(2)), month, 1)

    # bare "YYYY"
    m = re.match(r"^(\d{4})$", token)
    if m:
        return date(int(m.group(1)), 1, 1)

    return None


def _calculate_experience_years(resume: ParsedResume) -> float:
    """
    Sum the actual duration of every experience entry (full-time + internships).
    Returns total years as a float rounded to one decimal place.
    """
    import re
    from datetime import date

    if not resume.experience:
        return 0.0

    total_months = 0

    for exp in resume.experience:
        raw = (exp.dates or "").strip()
        if not raw:
            continue

        # Split on en-dash, em-dash, spaced hyphen, or " to "
        # Use the first split point only so "Jan 2020 - Mar 2022" splits to ["Jan 2020", "Mar 2022"]
        parts = re.split(r"\s*[–—]\s*|\s+-\s+|\s+to\s+", raw, maxsplit=1)

        if len(parts) == 2:
            start = _parse_month_year(parts[0])
            end   = _parse_month_year(parts[1])
        elif len(parts) == 1:
            # Single value like "2022" — treat as a one-month entry (negligible)
            start = _parse_month_year(parts[0])
            end   = start
        else:
            continue

        if start is None or end is None:
            continue

        months = (end.year - start.year) * 12 + (end.month - start.month)
        if months > 0:
            total_months += months

    return round(total_months / 12, 1)


def _resolve_years_display(actual_years: float, jd_required: int | None) -> str:
    """
    Decide what years string to surface in the summary.

    Rules (per user spec):
    - If JD requires X and candidate has >= X  →  use "X+" (ATS-aligned framing)
    - If JD requires X and candidate has < X   →  use actual years (never inflate)
    - If JD has no requirement                 →  use actual years
    """
    actual_int = int(actual_years)  # floor for display

    if jd_required is not None:
        if actual_years >= jd_required:
            return f"{jd_required}+"
        else:
            return str(actual_int) if actual_int > 0 else "<1"

    return str(actual_int) if actual_int > 0 else "<1"


def _build_full_text(
    tagline: str,
    summary: str,
    skills: dict[str, str],
    experience: list[TailoredExperienceEntry],
) -> str:
    """Build a single text blob from all tailored sections for keyword matching."""
    parts = [tagline, summary]
    for category_skills in skills.values():
        parts.append(category_skills)
    for exp in experience:
        parts.append(exp.title)
        parts.extend(exp.bullets)
    return " ".join(parts).lower()


def _compute_keyword_coverage(keywords: list[str], text: str) -> float:
    """Compute what percentage of JD keywords appear in the tailored text."""
    if not keywords:
        return 100.0
    hits = sum(1 for kw in keywords if kw.lower() in text)
    return (hits / len(keywords)) * 100
