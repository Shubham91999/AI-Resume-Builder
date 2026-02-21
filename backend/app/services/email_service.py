"""
Email Service — generate cold emails for recruiter and hiring manager.

Uses the tailored resume + JD context to produce two targeted emails
with different tones and focuses.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from app.models.email_models import EmailGenerateResponse, GeneratedEmail
from app.models.tailor_models import TailoredResume
from app.models.jd_models import ParsedJD
from app.prompts import email_recruiter, email_hiring_manager
from app.services.llm_service import complete_json

logger = logging.getLogger(__name__)

# In-memory cache for generated emails
_email_cache: dict[str, EmailGenerateResponse] = {}


async def generate_emails(
    *,
    tailored: TailoredResume,
    jd: ParsedJD,
    provider: str,
    model_key: str,
    api_key: str,
) -> EmailGenerateResponse:
    """
    Generate both recruiter and hiring manager cold emails.

    Args:
        tailored: The tailored resume to base emails on
        jd: The parsed job description
        provider: LLM provider key
        model_key: LLM model key
        api_key: User's API key
    """
    candidate_name = tailored.name

    # Extract key achievements from experience bullets (top 3-4 impactful ones)
    achievements = _extract_achievements(tailored)
    technical_highlights = _extract_technical_highlights(tailored)

    # Simplified skills for recruiter (no jargon)
    top_skills = ", ".join(list(tailored.skills.values())[:3]) if tailored.skills else "various technical skills"

    # Full technical skills for hiring manager
    all_skills = []
    for cat_skills in tailored.skills.values():
        all_skills.extend([s.strip() for s in cat_skills.split(",")])
    technical_skills = ", ".join(all_skills[:15])

    # ── Generate Recruiter Email ─────────────────────────────────────────
    logger.info("Generating recruiter cold email")
    recruiter_data = await complete_json(
        provider=provider,
        model_key=model_key,
        api_key=api_key,
        messages=[
            {"role": "system", "content": email_recruiter.SYSTEM_PROMPT},
            {"role": "user", "content": email_recruiter.USER_PROMPT_TEMPLATE.format(
                job_title=jd.job_title,
                company=jd.company,
                jd_type=jd.jd_type.value,
                candidate_name=candidate_name,
                tagline=tailored.tagline,
                achievements=achievements,
                top_skills=top_skills,
            )},
        ],
        prompt_name="email_recruiter",
    )

    recruiter_email = _parse_email(recruiter_data, "recruiter", candidate_name)

    # ── Generate Hiring Manager Email ────────────────────────────────────
    logger.info("Generating hiring manager cold email")
    responsibilities = "; ".join(jd.key_responsibilities[:4])

    hm_data = await complete_json(
        provider=provider,
        model_key=model_key,
        api_key=api_key,
        messages=[
            {"role": "system", "content": email_hiring_manager.SYSTEM_PROMPT},
            {"role": "user", "content": email_hiring_manager.USER_PROMPT_TEMPLATE.format(
                job_title=jd.job_title,
                company=jd.company,
                jd_type=jd.jd_type.value,
                required_skills=", ".join(jd.required_skills[:10]),
                responsibilities=responsibilities,
                candidate_name=candidate_name,
                tagline=tailored.tagline,
                technical_highlights=technical_highlights,
                technical_skills=technical_skills,
            )},
        ],
        prompt_name="email_hiring_manager",
    )

    hm_email = _parse_email(hm_data, "hiring_manager", candidate_name)

    # ── Build Response ───────────────────────────────────────────────────
    result = EmailGenerateResponse(
        id=str(uuid.uuid4()),
        tailor_id=tailored.id,
        jd_id=jd.jd_id if hasattr(jd, "jd_id") else jd.id,
        candidate_name=candidate_name,
        job_title=jd.job_title,
        company=jd.company,
        recruiter_email=recruiter_email,
        hiring_manager_email=hm_email,
    )

    _email_cache[result.id] = result
    logger.info(f"Emails generated: id={result.id} for tailor_id={tailored.id}")
    return result


def get_cached_emails(email_id: str) -> EmailGenerateResponse | None:
    """Retrieve cached emails by ID."""
    return _email_cache.get(email_id)


def list_cached_emails() -> list[EmailGenerateResponse]:
    """Return all cached email responses."""
    return list(_email_cache.values())


def get_emails_for_tailor(tailor_id: str) -> EmailGenerateResponse | None:
    """Find emails generated for a specific tailored resume."""
    for email_resp in _email_cache.values():
        if email_resp.tailor_id == tailor_id:
            return email_resp
    return None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _extract_achievements(tailored: TailoredResume) -> str:
    """Extract top achievements from experience bullets for the recruiter email."""
    bullets = []
    for exp in tailored.experience[:2]:  # Top 2 roles
        for b in exp.bullets[:2]:  # Top 2 bullets per role
            bullets.append(f"- {b}")
    return "\n".join(bullets) if bullets else "- Experienced professional with strong track record"


def _extract_technical_highlights(tailored: TailoredResume) -> str:
    """Extract technical highlights for the hiring manager email."""
    highlights = []
    for exp in tailored.experience[:2]:
        for b in exp.bullets[:2]:
            highlights.append(f"- {b}")
        if exp.keywords_used:
            highlights.append(f"  Technologies: {', '.join(exp.keywords_used[:5])}")
    return "\n".join(highlights) if highlights else "- Strong technical background"


def _parse_email(data: dict | list, target: str, candidate_name: str) -> GeneratedEmail:
    """Parse LLM output into a GeneratedEmail, with fallbacks."""
    if isinstance(data, dict):
        subject = data.get("subject", f"Regarding the open position")
        body = data.get("body", "")
        tips = data.get("tips", [])

        # Ensure the body is a string
        if not isinstance(body, str):
            body = str(body)
        if not isinstance(tips, list):
            tips = []
        tips = [str(t) for t in tips]

        return GeneratedEmail(
            target=target,
            subject=subject,
            body=body,
            tips=tips,
        )

    # Fallback
    return GeneratedEmail(
        target=target,
        subject=f"Interest in the open position at your company",
        body=f"Hi,\n\nI'm {candidate_name} and I'm interested in the role.\n\nBest regards,\n{candidate_name}",
        tips=["Consider personalizing this email further"],
    )
