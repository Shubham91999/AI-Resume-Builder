"""
Skill synonym map — normalize skill names and match with synonyms.

Loads data/skill_synonyms.json and provides bidirectional matching:
  canonical → [aliases]  AND  alias → canonical
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_SYNONYM_FILE = Path(__file__).resolve().parents[3] / "data" / "skill_synonyms.json"

# Built on first call, cached forever after
_canonical_to_aliases: dict[str, list[str]] | None = None
_alias_to_canonical: dict[str, str] | None = None


def _load() -> None:
    """Load the synonym file and build lookup tables."""
    global _canonical_to_aliases, _alias_to_canonical

    _canonical_to_aliases = {}
    _alias_to_canonical = {}

    try:
        raw = json.loads(_SYNONYM_FILE.read_text())
    except Exception as e:
        logger.warning(f"Could not load skill synonyms from {_SYNONYM_FILE}: {e}")
        return

    for canonical, aliases in raw.items():
        if canonical.startswith("_"):
            continue  # skip _comment
        canonical_lower = canonical.lower().strip()
        _canonical_to_aliases[canonical_lower] = [a.lower().strip() for a in aliases]
        for alias in aliases:
            _alias_to_canonical[alias.lower().strip()] = canonical_lower


def _ensure_loaded() -> None:
    if _canonical_to_aliases is None:
        _load()


def normalize_skill(skill: str) -> str:
    """Normalize a skill name to its canonical form."""
    _ensure_loaded()
    assert _alias_to_canonical is not None
    lower = skill.lower().strip()
    return _alias_to_canonical.get(lower, lower)


def skills_match(skill_a: str, skill_b: str) -> bool:
    """Check whether two skill names refer to the same thing (via synonym lookup)."""
    return normalize_skill(skill_a) == normalize_skill(skill_b)


def find_matching_skill(target: str, candidate_skills: list[str]) -> str | None:
    """
    Find a skill in candidate_skills that matches target (via synonyms).
    Returns the original candidate skill string, or None.
    """
    target_norm = normalize_skill(target)
    for cs in candidate_skills:
        if normalize_skill(cs) == target_norm:
            return cs
    return None


def get_all_forms(skill: str) -> set[str]:
    """Get all known forms of a skill (canonical + all aliases)."""
    _ensure_loaded()
    assert _canonical_to_aliases is not None and _alias_to_canonical is not None

    canonical = normalize_skill(skill)
    forms = {canonical}
    if canonical in _canonical_to_aliases:
        forms.update(_canonical_to_aliases[canonical])
    return forms
