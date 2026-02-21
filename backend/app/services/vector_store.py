"""
Vector Store — ChromaDB-backed storage for resume embeddings.

Provides:
  • Persistent resume embedding storage with metadata
  • Hash-based deduplication (skip reprocessing unchanged files)
  • Semantic search: query with JD embedding → ranked resume matches
  • Section-level embeddings for granular matching

Storage location: data/chroma_db/ (gitignored)
"""

from __future__ import annotations

import logging
from typing import Any

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.services.embedding_service import embed_text, embed_texts

logger = logging.getLogger(__name__)

# ── ChromaDB Client (lazy singleton) ─────────────────────────────────────────

_client: Any = None


def _get_client():
    """Get or create the persistent ChromaDB client."""
    global _client
    if _client is None:
        persist_dir = settings.chroma_persist_dir
        logger.info(f"Initializing ChromaDB at '{persist_dir}'")
        _client = chromadb.PersistentClient(
            path=persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        logger.info("ChromaDB client initialized.")
    return _client


def _get_resume_collection() -> chromadb.Collection:
    """Get or create the 'resumes' collection."""
    client = _get_client()
    return client.get_or_create_collection(
        name="resumes",
        metadata={"hnsw:space": "cosine"},
    )


def _get_projects_collection() -> chromadb.Collection:
    """Get or create the 'projects' collection."""
    client = _get_client()
    return client.get_or_create_collection(
        name="projects",
        metadata={"hnsw:space": "cosine"},
    )


# ── Resume Operations ────────────────────────────────────────────────────────


def store_resume(
    resume_id: str,
    *,
    file_name: str,
    file_hash: str,
    source: str,
    full_text: str,
    sections: dict[str, str] | None = None,
    drive_file_id: str | None = None,
) -> bool:
    """
    Store a resume embedding in ChromaDB.

    Args:
        resume_id: Unique ID for this resume
        file_name: Original file name
        file_hash: MD5 hash for dedup
        source: 'local_upload' or 'google_drive'
        full_text: The full resume text
        sections: Optional dict of section_name → section_text for granular embeddings
        drive_file_id: Google Drive file ID (if applicable)

    Returns:
        True if stored (new or updated), False if already exists with same hash
    """
    collection = _get_resume_collection()

    # Check if this hash already exists → skip reprocessing
    if _hash_exists(collection, file_hash):
        logger.info(f"Resume hash {file_hash[:8]} already in vector store, skipping.")
        return False

    # Generate embedding for full resume text
    embedding = embed_text(full_text)
    if embedding is None:
        logger.warning(f"Could not generate embedding for resume {resume_id}")
        return False

    metadata: dict[str, Any] = {
        "file_name": file_name,
        "file_hash": file_hash,
        "source": source,
    }
    if drive_file_id:
        metadata["drive_file_id"] = drive_file_id

    # Store the full-resume embedding
    try:
        collection.upsert(
            ids=[resume_id],
            embeddings=[embedding.tolist()],
            documents=[full_text[:10000]],  # Truncate for storage (ChromaDB limit)
            metadatas=[metadata],
        )
        logger.info(f"Stored resume '{file_name}' (id={resume_id}) in vector store.")
    except Exception as e:
        logger.error(f"Failed to store resume in ChromaDB: {e}")
        return False

    # Store section-level embeddings for granular matching
    if sections:
        _store_section_embeddings(resume_id, file_name, sections)

    return True


def _store_section_embeddings(
    resume_id: str, file_name: str, sections: dict[str, str]
) -> None:
    """Store per-section embeddings for granular JD → section matching."""
    collection = _get_resume_collection()
    for section_name, section_text in sections.items():
        if not section_text or len(section_text.strip()) < 10:
            continue
        emb = embed_text(section_text)
        if emb is None:
            continue
        section_id = f"{resume_id}__section__{section_name}"
        try:
            collection.upsert(
                ids=[section_id],
                embeddings=[emb.tolist()],
                documents=[section_text[:5000]],
                metadatas={
                    "file_name": file_name,
                    "parent_resume_id": resume_id,
                    "section": section_name,
                    "is_section": "true",
                },
            )
        except Exception as e:
            logger.warning(f"Failed to store section '{section_name}' for {resume_id}: {e}")


def query_resumes(
    query_text: str,
    *,
    n_results: int = 10,
) -> list[dict[str, Any]]:
    """
    Query the vector store for resumes most similar to the given text.

    Returns a list of dicts with keys: resume_id, file_name, score, document
    """
    collection = _get_resume_collection()
    query_emb = embed_text(query_text)
    if query_emb is None:
        return []

    try:
        results = collection.query(
            query_embeddings=[query_emb.tolist()],
            n_results=n_results,
            where={"is_section": {"$ne": "true"}} if _has_section_entries(collection) else None,
        )
    except Exception:
        # Fallback: query without filter
        try:
            results = collection.query(
                query_embeddings=[query_emb.tolist()],
                n_results=n_results,
            )
        except Exception as e:
            logger.error(f"ChromaDB query failed: {e}")
            return []

    if not results or not results.get("ids") or not results["ids"][0]:
        return []

    ranked: list[dict[str, Any]] = []
    metadatas = results.get("metadatas") or [[]]
    distances = results.get("distances") or [[]]
    documents = results.get("documents") or [[]]

    for i, rid in enumerate(results["ids"][0]):
        # Skip section-level entries
        if "__section__" in rid:
            continue
        meta = metadatas[0][i] if i < len(metadatas[0]) else {}
        dist = distances[0][i] if i < len(distances[0]) else 0.0
        doc = documents[0][i] if i < len(documents[0]) else ""
        entry: dict[str, Any] = {
            "resume_id": rid,
            "file_name": meta.get("file_name", "unknown") if isinstance(meta, dict) else "unknown",
            "score": 1.0 - dist,
            "document": doc or "",
        }
        ranked.append(entry)

    return ranked


def has_resume(file_hash: str) -> bool:
    """Check if a resume with the given file hash already exists in the store."""
    collection = _get_resume_collection()
    return _hash_exists(collection, file_hash)


def delete_resume(resume_id: str) -> bool:
    """Delete a resume and its section embeddings from the store."""
    collection = _get_resume_collection()
    try:
        # Delete main entry
        collection.delete(ids=[resume_id])
        # Delete section entries
        try:
            all_ids = collection.get(
                where={"parent_resume_id": resume_id}
            )
            if all_ids and all_ids["ids"]:
                collection.delete(ids=all_ids["ids"])
        except Exception:
            pass  # Section entries may not exist
        logger.info(f"Deleted resume {resume_id} from vector store.")
        return True
    except Exception as e:
        logger.error(f"Failed to delete resume {resume_id}: {e}")
        return False


def get_resume_count() -> int:
    """Return the number of resumes in the vector store."""
    collection = _get_resume_collection()
    return collection.count()


def clear_all() -> int:
    """Clear all data from the vector store. Returns count cleared."""
    client = _get_client()
    count = 0
    for name in ["resumes", "projects"]:
        try:
            col = client.get_collection(name)
            count += col.count()
            client.delete_collection(name)
        except Exception:
            pass
    logger.info(f"Cleared {count} entries from vector store.")
    return count


# ── Project Operations ───────────────────────────────────────────────────────


def store_project(
    project_id: str,
    *,
    name: str,
    text: str,
    skills: list[str],
) -> bool:
    """Store a project embedding in the projects collection."""
    collection = _get_projects_collection()
    embedding = embed_text(text)
    if embedding is None:
        return False
    try:
        collection.upsert(
            ids=[project_id],
            embeddings=[embedding.tolist()],
            documents=[text],
            metadatas={"name": name, "skills": ", ".join(skills)},
        )
        return True
    except Exception as e:
        logger.error(f"Failed to store project {project_id}: {e}")
        return False


def query_projects(
    jd_text: str, *, n_results: int = 5
) -> list[dict[str, Any]]:
    """Query for projects most relevant to a JD."""
    collection = _get_projects_collection()
    query_emb = embed_text(jd_text)
    if query_emb is None:
        return []
    try:
        results = collection.query(
            query_embeddings=[query_emb.tolist()],
            n_results=n_results,
        )
    except Exception as e:
        logger.error(f"Project query failed: {e}")
        return []

    if not results or not results["ids"] or not results["ids"][0]:
        return []

    ranked: list[dict[str, Any]] = []
    metadatas = results.get("metadatas") or [[]]
    distances = results.get("distances") or [[]]

    for i, pid in enumerate(results["ids"][0]):
        meta = metadatas[0][i] if i < len(metadatas[0]) else {}
        dist = distances[0][i] if i < len(distances[0]) else 0.0
        ranked.append({
            "project_id": pid,
            "name": meta.get("name", "") if isinstance(meta, dict) else "",
            "score": 1.0 - dist,
        })
    return ranked


# ── Helpers ──────────────────────────────────────────────────────────────────


def _hash_exists(collection: chromadb.Collection, file_hash: str) -> bool:
    """Check if a file hash already exists in a collection."""
    try:
        results = collection.get(
            where={"file_hash": file_hash},
            limit=1,
        )
        return bool(results and results["ids"])
    except Exception:
        return False


def _has_section_entries(collection: chromadb.Collection) -> bool:
    """Check if the collection has any section-level entries (to enable filtering)."""
    try:
        results = collection.get(
            where={"is_section": "true"},
            limit=1,
        )
        return bool(results and results["ids"])
    except Exception:
        return False
