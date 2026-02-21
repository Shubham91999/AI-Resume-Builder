from fastapi import APIRouter, HTTPException, Depends

from app.models.email_models import EmailGenerateRequest, EmailGenerateResponse
from app.services.email_service import (
    generate_emails,
    get_cached_emails,
    list_cached_emails,
    get_emails_for_tailor,
)
from app.services.tailor_service import get_cached_tailored
from app.services.jd_service import get_cached_jd
from app.utils.dependencies import APIKeys, get_api_keys

router = APIRouter()


@router.post("/generate", response_model=EmailGenerateResponse)
async def generate_cold_emails(
    req: EmailGenerateRequest,
    api_keys: APIKeys = Depends(get_api_keys),
):
    """Generate cold emails (recruiter + hiring manager) for a tailored resume."""
    tailored = get_cached_tailored(req.tailor_id)
    if not tailored:
        raise HTTPException(
            status_code=404,
            detail=f"Tailored resume '{req.tailor_id}' not found. Complete tailoring first.",
        )

    jd = get_cached_jd(tailored.jd_id)
    if not jd:
        raise HTTPException(
            status_code=404,
            detail=f"JD '{tailored.jd_id}' not found in cache.",
        )

    key = api_keys.get_key(req.provider)
    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"Missing API key for provider '{req.provider}'. Set it in Settings.",
        )

    try:
        result = await generate_emails(
            tailored=tailored,
            jd=jd,
            provider=req.provider,
            model_key=req.model_key,
            api_key=key,
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Email generation failed: {e}",
        )


@router.get("/cache", response_model=list[EmailGenerateResponse])
async def list_emails():
    """List all cached email responses."""
    return list_cached_emails()


@router.get("/{email_id}", response_model=EmailGenerateResponse)
async def get_email(email_id: str):
    """Get a specific email response by ID."""
    result = get_cached_emails(email_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Emails '{email_id}' not found")
    return result


@router.get("/for-tailor/{tailor_id}", response_model=EmailGenerateResponse)
async def get_emails_by_tailor(tailor_id: str):
    """Get emails generated for a specific tailored resume."""
    result = get_emails_for_tailor(tailor_id)
    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"No emails found for tailored resume '{tailor_id}'",
        )
    return result
