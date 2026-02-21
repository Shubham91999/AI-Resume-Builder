"""
Project Bank Service — CRUD + keyword-based project selection for JDs.

The project bank stores the user's full collection of projects.
Persisted to data/project_bank.yaml so projects survive server restarts.
When tailoring a resume, the system selects the top 2 most relevant
projects based on keyword overlap with the JD, then optionally rewrites
bullets via LLM.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Optional

import yaml

from app.models.resume_models import ProjectBankEntry, ProjectBankCreate, ProjectBankUpdate
from app.models.jd_models import ParsedJD
from app.models.tailor_models import SelectedProject
from app.utils.synonym_map import skills_match

logger = logging.getLogger(__name__)

# Path to the persistent YAML file
_YAML_PATH = Path(__file__).resolve().parents[3] / "data" / "project_bank.yaml"

# In-memory cache (loaded from YAML on first access)
_project_bank: dict[str, ProjectBankEntry] | None = None


# ── YAML Persistence ────────────────────────────────────────────────────────


def _load_from_yaml() -> dict[str, ProjectBankEntry]:
    """Load projects from the YAML file into memory."""
    if not _YAML_PATH.exists():
        return {}

    try:
        with open(_YAML_PATH, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f)
    except Exception as e:
        logger.error(f"Failed to read {_YAML_PATH}: {e}")
        return {}

    if not raw or not isinstance(raw, dict):
        return {}

    projects_list = raw.get("projects", [])
    if not isinstance(projects_list, list):
        return {}

    bank: dict[str, ProjectBankEntry] = {}
    for item in projects_list:
        if not isinstance(item, dict):
            continue
        proj_id = item.get("id", str(uuid.uuid4()))
        try:
            entry = ProjectBankEntry(
                id=proj_id,
                name=item.get("name", "Unnamed"),
                bullets=item.get("bullets", []),
                skills=item.get("skills", []),
            )
            bank[entry.id] = entry
        except Exception as e:
            logger.warning(f"Skipping invalid project entry: {e}")
    logger.info(f"Loaded {len(bank)} projects from {_YAML_PATH}")
    return bank


def _save_to_yaml() -> None:
    """Persist the in-memory project bank to YAML."""
    global _project_bank
    if _project_bank is None:
        return

    projects_list = [
        {
            "id": p.id,
            "name": p.name,
            "bullets": p.bullets,
            "skills": p.skills,
        }
        for p in _project_bank.values()
    ]
    data = {"projects": projects_list}

    try:
        _YAML_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_YAML_PATH, "w", encoding="utf-8") as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
        logger.info(f"Saved {len(projects_list)} projects to {_YAML_PATH}")
    except Exception as e:
        logger.error(f"Failed to save projects to {_YAML_PATH}: {e}")


def _get_bank() -> dict[str, ProjectBankEntry]:
    """Get the project bank, loading from YAML on first access."""
    global _project_bank
    if _project_bank is None:
        _project_bank = _load_from_yaml()
    return _project_bank


# ── CRUD ─────────────────────────────────────────────────────────────────────


def list_projects() -> list[ProjectBankEntry]:
    """Return all projects in the bank."""
    return list(_get_bank().values())


def get_project(project_id: str) -> Optional[ProjectBankEntry]:
    """Get a single project by ID."""
    return _get_bank().get(project_id)


def create_project(data: ProjectBankCreate) -> ProjectBankEntry:
    """Create a new project and add to the bank. Persists to YAML."""
    bank = _get_bank()
    entry = ProjectBankEntry(
        id=str(uuid.uuid4()),
        name=data.name,
        bullets=data.bullets,
        skills=data.skills,
    )
    bank[entry.id] = entry
    _save_to_yaml()
    logger.info(f"Project created: id={entry.id} name={entry.name}")
    return entry


def update_project(project_id: str, data: ProjectBankUpdate) -> Optional[ProjectBankEntry]:
    """Update an existing project. Returns None if not found. Persists to YAML."""
    bank = _get_bank()
    existing = bank.get(project_id)
    if not existing:
        return None

    updated = ProjectBankEntry(
        id=project_id,
        name=data.name if data.name is not None else existing.name,
        bullets=data.bullets if data.bullets is not None else existing.bullets,
        skills=data.skills if data.skills is not None else existing.skills,
    )
    bank[project_id] = updated
    _save_to_yaml()
    logger.info(f"Project updated: id={project_id}")
    return updated


def delete_project(project_id: str) -> bool:
    """Delete a project. Returns True if deleted, False if not found. Persists to YAML."""
    bank = _get_bank()
    if project_id in bank:
        del bank[project_id]
        _save_to_yaml()
        logger.info(f"Project deleted: id={project_id}")
        return True
    return False


# ── Project Selection ────────────────────────────────────────────────────────


def select_projects_for_jd(
    jd: ParsedJD,
    top_n: int = 2,
) -> list[SelectedProject]:
    """
    Score all projects against a JD using keyword overlap and return the top N.

    Scoring:
      - Each required skill matched = 3 points
      - Each preferred skill matched = 1 point
      - Each keyword matched in bullets = 0.5 points
      - Bonus for matching JD type keywords
    """
    projects = list(_get_bank().values())
    if not projects:
        return []

    # Build JD context
    required = [s.lower() for s in jd.required_skills]
    preferred = [s.lower() for s in jd.preferred_skills]
    keywords = [k.lower() for k in jd.keywords_to_match]

    scored: list[tuple[ProjectBankEntry, float, list[str]]] = []

    for proj in projects:
        score = 0.0
        reasons: list[str] = []
        proj_skills_lower = [s.lower() for s in proj.skills]
        bullet_text = " ".join(proj.bullets).lower()

        # Required skill matches (high weight)
        req_matches = []
        for rs in required:
            for ps in proj_skills_lower:
                if skills_match(rs, ps):
                    req_matches.append(rs)
                    break
            else:
                # Also check bullet text
                if rs in bullet_text:
                    req_matches.append(rs)
        if req_matches:
            score += len(req_matches) * 3
            reasons.append(f"Matches {len(req_matches)} required skills: {', '.join(req_matches[:5])}")

        # Preferred skill matches
        pref_matches = []
        for ps_skill in preferred:
            for proj_s in proj_skills_lower:
                if skills_match(ps_skill, proj_s):
                    pref_matches.append(ps_skill)
                    break
        if pref_matches:
            score += len(pref_matches) * 1
            reasons.append(f"Matches {len(pref_matches)} preferred skills")

        # Keyword overlap in bullets
        kw_hits = [k for k in keywords if k in bullet_text]
        if kw_hits:
            score += len(kw_hits) * 0.5
            reasons.append(f"{len(kw_hits)} JD keywords in bullets")

        if score > 0:
            scored.append((proj, score, reasons))

    # Sort by score descending
    scored.sort(key=lambda x: x[1], reverse=True)

    # Take top N
    selected: list[SelectedProject] = []
    for proj, score, reasons in scored[:top_n]:
        max_score = len(required) * 3 + len(preferred) * 1 + len(keywords) * 0.5
        norm_score = round((score / max_score) * 100, 1) if max_score > 0 else 0.0
        selected.append(SelectedProject(
            name=proj.name,
            score=norm_score,
            reason="; ".join(reasons) if reasons else "General relevance",
            bullets=proj.bullets,
        ))

    logger.info(
        f"Project selection: {len(projects)} total, {len(scored)} scored, "
        f"selected {len(selected)} for JD '{jd.job_title}'"
    )
    return selected
