"""
Embedding Service — generate sentence embeddings for semantic similarity.

Uses sentence-transformers (all-MiniLM-L6-v2) for fast, free, local embeddings.
Provides cosine similarity comparisons for:
  - Job title matching
  - Experience bullet relevance
  - Full resume-to-JD similarity
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Sequence

import numpy as np

logger = logging.getLogger(__name__)

# ── Model Loading (lazy singleton) ───────────────────────────────────────────

_model = None


def _get_model():
    """Lazy-load the sentence-transformers model on first use."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer

            logger.info("Loading sentence-transformers model: all-MiniLM-L6-v2 ...")
            _model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Embedding model loaded successfully.")
        except ImportError:
            logger.warning(
                "sentence-transformers not installed. "
                "Embeddings will fall back to None. Install with: pip install sentence-transformers"
            )
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
    return _model


# ── Public API ───────────────────────────────────────────────────────────────


def embed_text(text: str) -> np.ndarray | None:
    """
    Generate a 384-dim embedding for a single text string.
    Returns None if the model isn't available.
    """
    model = _get_model()
    if model is None:
        return None
    try:
        embedding = model.encode(text, normalize_embeddings=True)
        return np.array(embedding, dtype=np.float32)
    except Exception as e:
        logger.error(f"Embedding failed: {e}")
        return None


def embed_texts(texts: list[str]) -> list[np.ndarray] | None:
    """
    Generate embeddings for a batch of texts.
    Returns None if the model isn't available.
    """
    model = _get_model()
    if model is None:
        return None
    if not texts:
        return []
    try:
        embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)
        return [np.array(e, dtype=np.float32) for e in embeddings]
    except Exception as e:
        logger.error(f"Batch embedding failed: {e}")
        return None


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Compute cosine similarity between two normalized vectors.
    Returns 0.0 on error or if inputs are invalid.
    """
    try:
        # Vectors are already L2-normalized by sentence-transformers,
        # so cosine similarity = dot product.
        sim = float(np.dot(a, b))
        return max(0.0, min(1.0, sim))  # Clamp to [0, 1]
    except Exception:
        return 0.0


def cosine_similarity_batch(
    query: np.ndarray, candidates: Sequence[np.ndarray]
) -> list[float]:
    """
    Compute cosine similarity between a query vector and a list of candidate vectors.
    """
    if not candidates:
        return []
    try:
        matrix = np.stack(candidates)
        sims = matrix @ query
        return [max(0.0, min(1.0, float(s))) for s in sims]
    except Exception as e:
        logger.error(f"Batch cosine similarity failed: {e}")
        return [0.0] * len(candidates)


def semantic_similarity(text_a: str, text_b: str) -> float | None:
    """
    High-level helper: compute semantic similarity between two text strings.
    Returns a value in [0, 1], or None if embeddings aren't available.
    """
    emb_a = embed_text(text_a)
    emb_b = embed_text(text_b)
    if emb_a is None or emb_b is None:
        return None
    return cosine_similarity(emb_a, emb_b)


def best_match_similarity(
    query_text: str, candidate_texts: list[str]
) -> tuple[float, int] | None:
    """
    Find the most semantically similar candidate to the query.
    Returns (similarity_score, index) or None if embeddings aren't available.
    """
    if not candidate_texts:
        return None
    query_emb = embed_text(query_text)
    if query_emb is None:
        return None
    cand_embs = embed_texts(candidate_texts)
    if cand_embs is None:
        return None
    sims = cosine_similarity_batch(query_emb, cand_embs)
    best_idx = int(np.argmax(sims))
    return sims[best_idx], best_idx


def average_similarity(
    query_text: str, candidate_texts: list[str]
) -> float | None:
    """
    Average semantic similarity between a query and all candidates.
    Returns None if embeddings aren't available.
    """
    if not candidate_texts:
        return None
    query_emb = embed_text(query_text)
    if query_emb is None:
        return None
    cand_embs = embed_texts(candidate_texts)
    if cand_embs is None:
        return None
    sims = cosine_similarity_batch(query_emb, cand_embs)
    return float(np.mean(sims)) if sims else None
