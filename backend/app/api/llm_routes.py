from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.llm_service import get_providers_info, validate_api_key

router = APIRouter()


class ValidateKeyRequest(BaseModel):
    provider: str
    key: str


class ValidateKeyResponse(BaseModel):
    valid: bool
    provider: str
    model_used: str
    error: str | None = None


@router.get("/providers")
async def list_providers():
    """
    List all available LLM providers and their models.
    No API keys required — this is public metadata.
    """
    providers = get_providers_info()
    return {"providers": providers}


@router.post("/validate-key", response_model=ValidateKeyResponse)
async def validate_key_endpoint(req: ValidateKeyRequest):
    """
    Test if an API key is valid for a given provider.
    Makes a tiny completion call with the cheapest model.
    """
    if not req.key or not req.key.strip():
        raise HTTPException(status_code=400, detail="API key cannot be empty")
    if not req.provider:
        raise HTTPException(status_code=400, detail="Provider is required")

    result = await validate_api_key(provider=req.provider, api_key=req.key.strip())
    return ValidateKeyResponse(**result)
