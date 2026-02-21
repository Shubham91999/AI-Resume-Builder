from fastapi import APIRouter, Depends, HTTPException

from app.models.jd_models import JDUrlInput, JDTextInput, ParsedJD
from app.services.jd_service import parse_jd_text, parse_jd_url, get_cached_jd, list_cached_jds
from app.utils.dependencies import APIKeys, get_api_keys

router = APIRouter()


def _resolve_key(keys: APIKeys, provider: str) -> str:
    """Get the API key for the requested provider, or raise 400."""
    key = keys.get_key(provider)
    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key provided for provider '{provider}'. "
                   f"Add it on the Settings page first.",
        )
    return key


@router.post("/parse-url", response_model=ParsedJD)
async def parse_jd_from_url(req: JDUrlInput, keys: APIKeys = Depends(get_api_keys)):
    """Scrape and parse a job description from a URL."""
    api_key = _resolve_key(keys, req.provider)
    try:
        return await parse_jd_url(
            url=str(req.url),
            provider=req.provider,
            model_key=req.model_key,
            api_key=api_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"JD URL parsing failed: {e}")


@router.post("/parse-text", response_model=ParsedJD)
async def parse_jd_from_text(req: JDTextInput, keys: APIKeys = Depends(get_api_keys)):
    """Parse a raw job description text using LLM."""
    api_key = _resolve_key(keys, req.provider)
    try:
        return await parse_jd_text(
            text=req.text,
            provider=req.provider,
            model_key=req.model_key,
            api_key=api_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"JD text parsing failed: {e}")


@router.get("/cache", response_model=list[ParsedJD])
async def list_jds():
    """List all parsed JDs in the current session cache."""
    return list_cached_jds()


@router.get("/cache/{jd_id}", response_model=ParsedJD)
async def get_jd(jd_id: str):
    """Retrieve a specific parsed JD by ID."""
    jd = get_cached_jd(jd_id)
    if not jd:
        raise HTTPException(status_code=404, detail="JD not found")
    return jd
