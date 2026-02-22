"""
LLM Service — unified interface to all providers via LiteLLM.

Responsibilities:
  • Accept an API key + model identifier per-request (keys from frontend, not stored server-side)
  • Route to the correct provider (Groq, Google, OpenRouter) via LiteLLM
  • Validate API keys by making a tiny completion call
  • Provide structured completion helper (JSON mode)
  • Handle retries, timeouts, and rate-limit back-off
"""

from __future__ import annotations

import json
import logging
from typing import Any

import litellm
from litellm import acompletion

from app.config import MODELS, PROMPT_CONFIG

logger = logging.getLogger(__name__)

# Silence verbose LiteLLM logs in dev
litellm.suppress_debug_info = True
litellm.set_verbose = False


# ── Helpers ──────────────────────────────────────────────────────────────────

# Maps our provider key → the env var name that LiteLLM expects
PROVIDER_KEY_ENV = {
    "groq": "GROQ_API_KEY",
    "google": "GEMINI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

# Tiny prompt used for key validation (cheap, fast)
_VALIDATION_PROMPT = "Respond with exactly: OK"


def _resolve_model_id(provider: str, model_key: str) -> str:
    """Look up the LiteLLM model_id from our registry."""
    provider_models = MODELS.get(provider)
    if not provider_models:
        raise ValueError(f"Unknown provider: {provider}")
    model_entry = provider_models.get(model_key)
    if not model_entry:
        raise ValueError(f"Unknown model: {model_key} for provider {provider}")
    return model_entry["model_id"]


def _build_api_key_kwarg(provider: str, api_key: str) -> dict[str, str]:
    """Return the keyword argument dict that LiteLLM expects for the provider's API key."""
    if provider == "groq":
        return {"api_key": api_key}
    elif provider == "google":
        return {"api_key": api_key}
    elif provider == "openrouter":
        return {"api_key": api_key}
    return {"api_key": api_key}


# ── Core Completion ──────────────────────────────────────────────────────────


async def complete(
    *,
    provider: str,
    model_key: str,
    api_key: str,
    messages: list[dict[str, str]],
    prompt_name: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    json_mode: bool = False,
) -> str:
    """
    Send a chat completion request via LiteLLM.

    Args:
        provider:    "groq" | "google" | "openrouter"
        model_key:   Key from MODELS registry (e.g. "llama-3.3-70b")
        api_key:     User's API key for the provider
        messages:    OpenAI-format message list
        prompt_name: Optional key into PROMPT_CONFIG for default temp/tokens
        temperature: Override temperature (takes precedence over prompt_name)
        max_tokens:  Override max_tokens (takes precedence over prompt_name)
        json_mode:   If True, request JSON output

    Returns:
        The assistant's response text.
    """
    model_id = _resolve_model_id(provider, model_key)

    # Merge prompt config defaults → explicit overrides
    config = PROMPT_CONFIG.get(prompt_name, {}) if prompt_name else {}
    temp = temperature if temperature is not None else config.get("temperature", 0.3)
    tokens = max_tokens if max_tokens is not None else config.get("max_tokens", 1500)

    kwargs: dict[str, Any] = {
        "model": model_id,
        "messages": messages,
        "temperature": temp,
        "max_tokens": tokens,
        **_build_api_key_kwarg(provider, api_key),
    }

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    logger.info(f"LLM call: provider={provider} model={model_id} temp={temp} tokens={tokens}")

    try:
        response = await acompletion(**kwargs)
        content = response.choices[0].message.content
        logger.info(f"LLM response: {len(content)} chars, usage={response.usage}")
        return content
    except Exception as e:
        logger.error(f"LLM error ({provider}/{model_key}): {e}")
        raise


async def complete_json(
    *,
    provider: str,
    model_key: str,
    api_key: str,
    messages: list[dict[str, str]],
    prompt_name: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict | list:
    """
    Same as complete() but parses the response as JSON.
    Falls back to extracting JSON from markdown code blocks if needed.
    """
    raw = await complete(
        provider=provider,
        model_key=model_key,
        api_key=api_key,
        messages=messages,
        prompt_name=prompt_name,
        temperature=temperature,
        max_tokens=max_tokens,
        json_mode=True,
    )

    # Try direct parse first
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try extracting from ```json ... ``` blocks
    if "```json" in raw:
        start = raw.index("```json") + 7
        end = raw.find("```", start)
        if end != -1:
            return json.loads(raw[start:end].strip())

    # Try extracting from ``` ... ``` blocks
    if "```" in raw:
        start = raw.index("```") + 3
        end = raw.find("```", start)
        if end != -1:
            return json.loads(raw[start:end].strip())

    raise ValueError(f"Could not parse LLM response as JSON: {raw[:200]}...")


# ── Key Validation ───────────────────────────────────────────────────────────


async def validate_api_key(provider: str, api_key: str) -> dict[str, Any]:
    """
    Validate an API key by making a tiny completion call with the cheapest model.

    Returns: {"valid": bool, "provider": str, "model_used": str, "error": str | None}
    """
    # Pick the cheapest/fastest model for validation
    cheapest_model_key = _get_cheapest_model(provider)
    model_id = _resolve_model_id(provider, cheapest_model_key)

    try:
        response = await acompletion(
            model=model_id,
            messages=[{"role": "user", "content": _VALIDATION_PROMPT}],
            max_tokens=5,
            temperature=0,
            **_build_api_key_kwarg(provider, api_key),
        )
        _ = response.choices[0].message.content
        return {
            "valid": True,
            "provider": provider,
            "model_used": model_id,
            "error": None,
        }
    except Exception as e:
        raw_error = str(e).lower()
        logger.warning(f"Key validation RAW error for {provider}: {raw_error}")
        error_msg = str(e)
        # Detect common error types — be specific to avoid misclassifying model errors
        if "401" in raw_error or "invalid_api_key" in raw_error or "invalid api key" in raw_error or "authentication" in raw_error:
            error_msg = "Invalid API key"
        elif "429" in raw_error or "rate_limit" in raw_error or "rate limit" in raw_error or "too many requests" in raw_error:
            error_msg = "Rate limited — key is valid but you've hit the free tier limit. Try again later."
        elif "404" in raw_error or "model_not_found" in raw_error or "model not found" in raw_error or "does not exist" in raw_error or "model_decommissioned" in raw_error:
            error_msg = "Model not available — the provider may have changed their API. Try a different model."

        logger.warning(f"Key validation failed for {provider}: {error_msg}")
        return {
            "valid": False,
            "provider": provider,
            "model_used": model_id,
            "error": error_msg,
        }


def _get_cheapest_model(provider: str) -> str:
    """Return the most reliable model key for a provider (used for key validation)."""
    provider_models = MODELS.get(provider, {})
    # Prefer the recommended model — it's most likely to still be available
    for key, info in provider_models.items():
        if info.get("recommended", False):
            return key
    # Fallback: first model
    return next(iter(provider_models))


# ── Provider Info ────────────────────────────────────────────────────────────


def get_providers_info() -> list[dict[str, Any]]:
    """
    Return a list of provider info dicts for the frontend.
    No secrets are exposed — just provider names, model names, and metadata.
    """
    providers = []
    for provider_key, models in MODELS.items():
        model_list = []
        for model_key, model_info in models.items():
            model_list.append({
                "key": model_key,
                "name": model_info["name"],
                "model_id": model_info["model_id"],
                "description": model_info["description"],
                "recommended": model_info.get("recommended", False),
            })
        providers.append({
            "id": provider_key,
            "name": _provider_display_name(provider_key),
            "models": model_list,
            "key_env_var": PROVIDER_KEY_ENV.get(provider_key, ""),
            "key_url": _provider_key_url(provider_key),
        })
    return providers


def _provider_display_name(provider: str) -> str:
    return {
        "groq": "Groq",
        "google": "Google AI Studio",
        "openrouter": "OpenRouter",
    }.get(provider, provider.title())


def _provider_key_url(provider: str) -> str:
    return {
        "groq": "https://console.groq.com/keys",
        "google": "https://aistudio.google.com/apikey",
        "openrouter": "https://openrouter.ai/keys",
    }.get(provider, "")
