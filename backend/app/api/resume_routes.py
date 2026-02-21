from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Header
from pydantic import BaseModel
from typing import Optional
import logging

from app.models.resume_models import ParsedResume
from app.models.score_models import RankingResponse
from app.services.resume_service import (
    parse_resume,
    get_cached_resume,
    list_cached_resumes,
    clear_cached_resumes,
)
from app.services.ats_scorer import rank_resumes as do_rank
from app.services.jd_service import get_cached_jd
from app.services import drive_service
from app.utils.dependencies import APIKeys, get_api_keys
from app.config import MODELS

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_key(api_keys: APIKeys, provider: str) -> str:
    """Get the API key for the given provider from the request headers."""
    key = api_keys.get_key(provider)
    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"Missing API key for provider '{provider}'. Set it in Settings.",
        )
    return key


@router.post("/upload", response_model=ParsedResume)
async def upload_resume(
    file: UploadFile = File(...),
    provider: str = Header(alias="X-LLM-Provider", default="groq"),
    model_key: str = Header(alias="X-LLM-Model", default="llama-3.3-70b"),
    api_keys: APIKeys = Depends(get_api_keys),
):
    """Upload a single resume file (PDF/DOCX) and parse it via LLM."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("pdf", "docx", "doc"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: .{ext}. Please upload PDF or DOCX.",
        )

    key = _resolve_key(api_keys, provider)

    try:
        file_bytes = await file.read()
        if len(file_bytes) > 10 * 1024 * 1024:  # 10 MB limit
            raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

        parsed = await parse_resume(
            file_bytes=file_bytes,
            file_name=file.filename,
            provider=provider,
            model_key=model_key,
            api_key=key,
        )
        return parsed

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Resume parsing failed: {e}",
        )


@router.post("/upload-multiple")
async def upload_multiple_resumes(
    files: list[UploadFile] = File(...),
    provider: str = Header(alias="X-LLM-Provider", default="groq"),
    model_key: str = Header(alias="X-LLM-Model", default="llama-3.3-70b"),
    api_keys: APIKeys = Depends(get_api_keys),
):
    """Upload multiple resume files and parse them all."""
    key = _resolve_key(api_keys, provider)
    results: list[dict] = []

    for f in files:
        try:
            if not f.filename:
                results.append({"file_name": "unknown", "success": False, "error": "No filename"})
                continue

            ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
            if ext not in ("pdf", "docx", "doc"):
                results.append({"file_name": f.filename, "success": False, "error": f"Unsupported type: .{ext}"})
                continue

            file_bytes = await f.read()
            if len(file_bytes) > 10 * 1024 * 1024:
                results.append({"file_name": f.filename, "success": False, "error": "File too large"})
                continue

            parsed = await parse_resume(
                file_bytes=file_bytes,
                file_name=f.filename,
                provider=provider,
                model_key=model_key,
                api_key=key,
            )
            results.append({
                "file_name": f.filename,
                "success": True,
                "resume_id": parsed.id,
                "name": parsed.name,
            })
        except Exception as e:
            results.append({"file_name": f.filename or "unknown", "success": False, "error": str(e)})

    return {
        "total": len(files),
        "successful": sum(1 for r in results if r.get("success")),
        "results": results,
    }


@router.get("/cache", response_model=list[ParsedResume])
async def list_resumes():
    """List all cached parsed resumes."""
    return list_cached_resumes()


@router.get("/cache/{resume_id}", response_model=ParsedResume)
async def get_resume(resume_id: str):
    """Get a specific cached parsed resume by ID."""
    resume = get_cached_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail=f"Resume '{resume_id}' not found in cache")
    return resume


@router.delete("/cache")
async def clear_resumes():
    """Clear all cached resumes."""
    count = clear_cached_resumes()
    return {"cleared": count}


@router.post("/drive")
async def import_from_drive():
    """Fetch resumes from a Google Drive folder link."""
    # TODO: Phase 10 — Google Drive integration
    return {"message": "Google Drive import not yet implemented"}


# ── Google Drive Endpoints ──────────────────────────────────────────────────


class DriveImportRequest(BaseModel):
    """Request body for importing resumes from Google Drive."""
    folder_link: str
    provider: str = "groq"
    model_key: str = "llama-3.3-70b"


@router.get("/drive/auth-url")
async def get_drive_auth_url():
    """Get the Google OAuth2 consent URL for Drive access."""
    try:
        url = drive_service.get_auth_url()
        return {"auth_url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/drive/callback")
async def drive_auth_callback(code: str):
    """Exchange the OAuth2 authorization code for credentials."""
    try:
        success = drive_service.handle_auth_callback(code)
        if success:
            return {"authenticated": True, "message": "Google Drive connected successfully"}
        raise HTTPException(status_code=400, detail="Authentication failed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"OAuth callback failed: {e}")


@router.get("/drive/status")
async def drive_auth_status():
    """Check if Google Drive is authenticated."""
    return {"authenticated": drive_service.is_authenticated()}


@router.post("/drive/disconnect")
async def drive_disconnect():
    """Disconnect Google Drive (clear stored credentials)."""
    drive_service.disconnect()
    return {"authenticated": False, "message": "Google Drive disconnected"}


@router.post("/drive/list-files")
async def list_drive_files(folder_link: str):
    """List PDF/DOCX files in a Google Drive folder."""
    if not drive_service.is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="Not authenticated with Google Drive. Please connect first.",
        )

    try:
        folder_id = drive_service.parse_folder_id(folder_link)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        files = drive_service.list_files_in_folder(folder_id)
        return {"folder_id": folder_id, "files": files, "total": len(files)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list Drive files: {e}")


@router.post("/drive/import")
async def import_from_drive_folder(
    body: DriveImportRequest,
    api_keys: APIKeys = Depends(get_api_keys),
):
    """Import and parse all PDF/DOCX files from a Google Drive folder.

    Downloads each file, feeds it through the resume parser, and caches results.
    """
    if not drive_service.is_authenticated():
        raise HTTPException(
            status_code=401,
            detail="Not authenticated with Google Drive. Please connect first.",
        )

    # Resolve API key
    key = api_keys.get_key(body.provider)
    if not key:
        raise HTTPException(
            status_code=400,
            detail=f"Missing API key for provider '{body.provider}'.",
        )

    # Parse folder ID
    try:
        folder_id = drive_service.parse_folder_id(body.folder_link)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # List files
    try:
        files = drive_service.list_files_in_folder(folder_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list Drive files: {e}")

    if not files:
        raise HTTPException(
            status_code=404,
            detail="No PDF or DOCX files found in the specified folder.",
        )

    # Download and parse each file
    results: list[dict] = []
    for f in files:
        try:
            file_bytes = drive_service.download_file(f["id"], f["name"])

            if len(file_bytes) > 10 * 1024 * 1024:  # 10 MB limit
                results.append({
                    "file_name": f["name"],
                    "success": False,
                    "error": "File too large (max 10 MB)",
                })
                continue

            parsed = await parse_resume(
                file_bytes=file_bytes,
                file_name=f["name"],
                provider=body.provider,
                model_key=body.model_key,
                api_key=key,
                source="google_drive",
                drive_file_id=f["id"],
            )
            results.append({
                "file_name": f["name"],
                "success": True,
                "resume_id": parsed.id,
                "name": parsed.name,
            })
        except Exception as e:
            logger.error(f"Failed to import {f['name']} from Drive: {e}")
            results.append({
                "file_name": f["name"],
                "success": False,
                "error": str(e),
            })

    return {
        "folder_id": folder_id,
        "total": len(files),
        "successful": sum(1 for r in results if r.get("success")),
        "results": results,
    }


@router.get("/rank", response_model=RankingResponse)
async def rank_resumes_endpoint(jd_id: str):
    """Score and rank all cached resumes against a parsed JD."""
    jd = get_cached_jd(jd_id)
    if not jd:
        raise HTTPException(status_code=404, detail=f"JD '{jd_id}' not found in cache. Parse a JD first.")

    resumes = list_cached_resumes()
    if not resumes:
        raise HTTPException(status_code=400, detail="No resumes uploaded. Upload resumes first.")

    ranking = do_rank(jd, resumes)
    return ranking
