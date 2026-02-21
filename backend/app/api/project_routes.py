from fastapi import APIRouter, HTTPException, Depends

from app.models.resume_models import (
    ProjectBankEntry,
    ProjectBankCreate,
    ProjectBankUpdate,
)
from app.models.tailor_models import SelectedProject
from app.services.project_service import (
    list_projects,
    get_project,
    create_project,
    update_project,
    delete_project,
    select_projects_for_jd,
)
from app.services.jd_service import get_cached_jd
from app.services.llm_service import complete_json
from app.prompts import project_rewriter
from app.utils.dependencies import APIKeys, get_api_keys

router = APIRouter()


# ── CRUD ─────────────────────────────────────────────────────────────────────


@router.get("/", response_model=list[ProjectBankEntry])
async def list_all_projects():
    """List all projects from the project bank."""
    return list_projects()


@router.post("/", response_model=ProjectBankEntry, status_code=201)
async def create_new_project(data: ProjectBankCreate):
    """Add a new project to the bank."""
    return create_project(data)


@router.get("/{project_id}", response_model=ProjectBankEntry)
async def get_single_project(project_id: str):
    """Get a single project by ID."""
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return proj


@router.put("/{project_id}", response_model=ProjectBankEntry)
async def update_existing_project(project_id: str, data: ProjectBankUpdate):
    """Update an existing project."""
    result = update_project(project_id, data)
    if not result:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return result


@router.delete("/{project_id}")
async def delete_existing_project(project_id: str):
    """Delete a project from the bank."""
    if not delete_project(project_id):
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
    return {"deleted": True, "id": project_id}


# ── Selection ────────────────────────────────────────────────────────────────


@router.post("/select", response_model=list[SelectedProject])
async def select_projects(
    jd_id: str,
    top_n: int = 2,
):
    """Select the top N projects from the bank that best match a JD."""
    jd = get_cached_jd(jd_id)
    if not jd:
        raise HTTPException(status_code=404, detail=f"JD '{jd_id}' not found")
    return select_projects_for_jd(jd, top_n=top_n)


@router.post("/rewrite-bullets")
async def rewrite_project_bullets(
    project_id: str,
    jd_id: str,
    api_keys: APIKeys = Depends(get_api_keys),
    provider: str = "groq",
    model_key: str = "llama-3.3-70b",
):
    """Rewrite a project's bullets to better match a JD using LLM."""
    proj = get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")

    jd = get_cached_jd(jd_id)
    if not jd:
        raise HTTPException(status_code=404, detail=f"JD '{jd_id}' not found")

    key = api_keys.get_key(provider)
    if not key:
        raise HTTPException(status_code=400, detail=f"Missing API key for '{provider}'")

    bullets_text = "\n".join(f"- {b}" for b in proj.bullets)

    result = await complete_json(
        provider=provider,
        model_key=model_key,
        api_key=key,
        messages=[
            {"role": "system", "content": project_rewriter.SYSTEM_PROMPT},
            {"role": "user", "content": project_rewriter.USER_PROMPT_TEMPLATE.format(
                job_title=jd.job_title,
                required_skills=", ".join(jd.required_skills),
                keywords=", ".join(jd.keywords_to_match),
                project_name=proj.name,
                project_bullets=bullets_text,
            )},
        ],
        prompt_name="project_selector",
    )

    rewritten_bullets = result.get("bullets", proj.bullets) if isinstance(result, dict) else proj.bullets
    keywords_used = result.get("keywords_used", []) if isinstance(result, dict) else []

    return {
        "project_id": project_id,
        "original_bullets": proj.bullets,
        "rewritten_bullets": rewritten_bullets,
        "keywords_used": keywords_used,
    }
