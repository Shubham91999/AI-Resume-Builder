from fastapi import APIRouter, HTTPException, Depends

from app.models.tailor_models import TailorRequest, TailoredResume
from app.models.score_models import ScoreComparison
from app.services.tailor_service import (
    tailor_resume,
    get_cached_tailored,
    list_cached_tailored,
)
from app.services.jd_service import get_cached_jd
from app.services.resume_service import get_cached_resume
from app.services.ats_scorer import score_resume
from app.services.output_packager import build_score_comparison
from app.utils.dependencies import APIKeys, get_api_keys
from app.models.resume_models import (
    ParsedResume,
    ContactInfo,
    ExperienceEntry,
    ProjectEntry,
    EducationEntry,
)

router = APIRouter()


def _resolve_key(api_keys: APIKeys, provider: str) -> str:
    """Get the API key for the given provider from request headers."""
    key = api_keys.get_key(provider)
    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"Missing API key for provider '{provider}'. Set it in Settings.",
        )
    return key


@router.post("/", response_model=TailoredResume)
async def tailor_resume_endpoint(
    req: TailorRequest,
    api_keys: APIKeys = Depends(get_api_keys),
):
    """Tailor a resume section-by-section for a JD."""
    # Resolve JD and resume from cache
    jd = get_cached_jd(req.jd_id)
    if not jd:
        raise HTTPException(status_code=404, detail=f"JD '{req.jd_id}' not found. Parse a JD first.")

    resume = get_cached_resume(req.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail=f"Resume '{req.resume_id}' not found. Upload a resume first.")

    provider = req.provider or "groq"
    model_key = req.model_key or "llama-3.3-70b"
    key = _resolve_key(api_keys, provider)

    try:
        result = await tailor_resume(
            jd=jd,
            resume=resume,
            provider=provider,
            model_key=model_key,
            api_key=key,
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Tailoring failed: {e}",
        )


@router.get("/cache", response_model=list[TailoredResume])
async def list_tailored():
    """List all cached tailored resumes."""
    return list_cached_tailored()


@router.get("/{tailor_id}", response_model=TailoredResume)
async def get_tailored_resume(tailor_id: str):
    """Get a tailored resume by ID."""
    result = get_cached_tailored(tailor_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Tailored resume '{tailor_id}' not found")
    return result


@router.get("/{tailor_id}/score-comparison", response_model=ScoreComparison)
async def get_score_comparison(tailor_id: str):
    """
    Get the before/after ATS score comparison for a tailored resume.

    Scores the original resume and the tailored version against the same JD.
    """
    tailored = get_cached_tailored(tailor_id)
    if not tailored:
        raise HTTPException(status_code=404, detail=f"Tailored resume '{tailor_id}' not found")

    jd = get_cached_jd(tailored.jd_id)
    if not jd:
        raise HTTPException(status_code=404, detail="Original JD no longer in cache")

    original = get_cached_resume(tailored.original_resume_id)
    if not original:
        raise HTTPException(status_code=404, detail="Original resume no longer in cache")

    # Score original resume
    before_score = score_resume(jd, original)

    # Build a ParsedResume from the tailored output for scoring
    tailored_as_resume = _tailored_to_parsed(tailored)
    after_score = score_resume(jd, tailored_as_resume)

    return build_score_comparison(
        before_score=before_score,
        after_score=after_score,
        tailored=tailored,
    )


def _tailored_to_parsed(tailored: TailoredResume) -> ParsedResume:
    """Convert a TailoredResume to a ParsedResume for ATS scoring."""
    # Flatten skills dict values into a list
    all_skills: list[str] = []
    for category_skills in tailored.skills.values():
        all_skills.extend([s.strip() for s in category_skills.split(",") if s.strip()])

    contact_data = tailored.contact or {}
    contact = ContactInfo(
        email=contact_data.get("email"),
        phone=contact_data.get("phone"),
        linkedin=contact_data.get("linkedin"),
        location=contact_data.get("location"),
    )

    experience = [
        ExperienceEntry(
            title=exp.title,
            company=exp.company,
            dates=exp.dates,
            bullets=exp.bullets,
        )
        for exp in tailored.experience
    ]

    projects = [
        ProjectEntry(
            name=proj.name,
            technologies=[],
            bullets=proj.bullets,
        )
        for proj in tailored.projects
    ]

    education = [
        EducationEntry(
            degree=edu.get("degree", ""),
            school=edu.get("school", ""),
            year=edu.get("year"),
        )
        for edu in tailored.education
        if isinstance(edu, dict)
    ]

    return ParsedResume(
        id=f"{tailored.id}__tailored",
        file_name="tailored_resume",
        file_hash="",
        source="tailored",
        name=tailored.name,
        contact=contact,
        tagline=tailored.tagline,
        summary=tailored.summary,
        skills=all_skills,
        experience=experience,
        projects=projects,
        education=education,
        certifications=tailored.certifications,
        raw_text="",
    )
