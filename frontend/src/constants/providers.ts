/** localStorage keys used across multiple pages */
export const STORAGE_KEY_API_KEYS = "art_api_keys";
export const STORAGE_KEY_SELECTED_MODEL = "art_selected_model";

/** Default provider and model key — must match backend config.py defaults */
export const DEFAULT_PROVIDER = "groq";
export const DEFAULT_MODEL_KEY = "llama-3.3-70b";

/** Read the selected LLM model from localStorage. Returns null if not set. */
export function getSelectedModel(): { provider: string; model_key: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SELECTED_MODEL);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.provider && parsed?.model_key) return parsed;
    return null;
  } catch {
    return null;
  }
}
