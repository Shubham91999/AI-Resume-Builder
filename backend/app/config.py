from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_name: str = "AI Resume Tailor"
    debug: bool = True

    # CORS
    frontend_url: str = "http://localhost:5173"

    # LLM API Keys (provided by user per-request via headers, these are optional server defaults)
    groq_api_key: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None

    # Google Drive
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None

    # ChromaDB
    chroma_persist_dir: str = "data/chroma_db"

    # Output
    output_dir: str = "data/outputs"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()


# ── Model Registry ──────────────────────────────────────────────────────────

MODELS = {
    "groq": {
        "llama-3.3-70b": {
            "name": "LLaMA 3.3 70B",
            "model_id": "groq/llama-3.3-70b-versatile",
            "description": "Best all-rounder for resume writing",
            "recommended": True,
        },
        "qwen-qwq-32b": {
            "name": "Qwen QwQ 32B",
            "model_id": "groq/qwen-qwq-32b",
            "description": "Fast reasoning, keyword extraction",
            "recommended": False,
        },
    },
    "google": {
        "gemini-2.0-flash": {
            "name": "Gemini 2.0 Flash",
            "model_id": "gemini/gemini-2.0-flash",
            "description": "Most reliable structured output",
            "recommended": True,
        },
        "gemini-1.5-flash": {
            "name": "Gemini 1.5 Flash",
            "model_id": "gemini/gemini-1.5-flash",
            "description": "Fallback when 2.0 hits rate limits",
            "recommended": False,
        },
    },
    "openrouter": {
        "deepseek-r1-0528": {
            "name": "DeepSeek R1 0528",
            "model_id": "openrouter/deepseek/deepseek-r1-0528:free",
            "description": "Deep reasoning, JD strategy",
            "recommended": False,
        },
        "kimi-k2": {
            "name": "Kimi K2",
            "model_id": "openrouter/moonshotai/kimi-k2:free",
            "description": "Best for tech-heavy roles",
            "recommended": False,
        },
    },
}

# ── Prompt Configuration ────────────────────────────────────────────────────

PROMPT_CONFIG = {
    "jd_parser": {"temperature": 0.1, "max_tokens": 1500},
    "resume_extractor": {"temperature": 0.1, "max_tokens": 2000},
    "tailor_tagline": {"temperature": 0.7, "max_tokens": 200},
    "tailor_summary": {"temperature": 0.5, "max_tokens": 300},
    "tailor_skills": {"temperature": 0.1, "max_tokens": 500},
    "tailor_experience": {"temperature": 0.5, "max_tokens": 1500},
    "project_selector": {"temperature": 0.3, "max_tokens": 1500},
    "project_rewriter": {"temperature": 0.5, "max_tokens": 800},
    "content_shortener": {"temperature": 0.2, "max_tokens": 1500},
    "email_recruiter": {"temperature": 0.7, "max_tokens": 500},
    "email_hiring_manager": {"temperature": 0.6, "max_tokens": 600},
}
