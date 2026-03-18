import axios from "axios";
import type { TailorRequest, TailoredResume, TailorProgress } from "@/types";
import { STORAGE_KEY_API_KEYS } from "@/constants/providers";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { "Content-Type": "application/json" },
  timeout: 120_000, // 2 min — LLM calls can be slow
});

// ── Inject stored API keys into every request ───────────────────────────────
api.interceptors.request.use((config) => {
  try {
    const keys: Record<string, string> = JSON.parse(
      localStorage.getItem(STORAGE_KEY_API_KEYS) ?? "{}"
    );
    if (keys.groq) config.headers["X-Groq-Key"] = keys.groq;
    if (keys.google) config.headers["X-Google-Key"] = keys.google;
    if (keys.openrouter) config.headers["X-OpenRouter-Key"] = keys.openrouter;
  } catch {
    // noop
  }
  return config;
});

// ---- Health ----
export const checkHealth = () =>
  api.get("/health").then((r) => r.data);

// ---- JD ----
export const parseJDUrl = (url: string, provider: string, model_key: string) =>
  api.post("/jd/parse-url", { url, provider, model_key }).then((r) => r.data);

export const parseJDText = (text: string, provider: string, model_key: string) =>
  api.post("/jd/parse-text", { text, provider, model_key }).then((r) => r.data);

export const getCachedJDs = () =>
  api.get("/jd/cache").then((r) => r.data);

export const getCachedJD = (id: string) =>
  api.get(`/jd/cache/${id}`).then((r) => r.data);

// ---- Resume ----
export const uploadResume = (file: File, provider: string, modelKey: string) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/resumes/upload", form, {
    headers: {
      "Content-Type": "multipart/form-data",
      "X-LLM-Provider": provider,
      "X-LLM-Model": modelKey,
    },
    timeout: 180_000, // 3 min — PDF extraction + LLM call
  }).then((r) => r.data);
};

export const uploadMultipleResumes = (files: File[], provider: string, modelKey: string) => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return api.post("/resumes/upload-multiple", form, {
    headers: {
      "Content-Type": "multipart/form-data",
      "X-LLM-Provider": provider,
      "X-LLM-Model": modelKey,
    },
    timeout: 300_000, // 5 min for multiple files
  }).then((r) => r.data);
};

export const getCachedResumes = () =>
  api.get("/resumes/cache").then((r) => r.data);

export const getCachedResume = (id: string) =>
  api.get(`/resumes/cache/${id}`).then((r) => r.data);

export const clearCachedResumes = () =>
  api.delete("/resumes/cache").then((r) => r.data);

export const rankResumes = (jdId: string) =>
  api.get(`/resumes/rank?jd_id=${encodeURIComponent(jdId)}`).then((r) => r.data);

// ---- Tailor ----
export const tailorResume = (payload: {
  jd_id: string;
  resume_id: string;
  provider: string;
  model_key: string;
}) => api.post("/tailor/", payload, { timeout: 300_000 }).then((r) => r.data);

/** Stream tailor progress via SSE (uses fetch + ReadableStream to support custom headers). */
export async function streamTailorResume(
  payload: TailorRequest,
  onProgress: (event: TailorProgress) => void,
  onDone: (result: TailoredResume) => void,
  onError: (message: string) => void,
): Promise<void> {
  let keys: Record<string, string> = {};
  try { keys = JSON.parse(localStorage.getItem(STORAGE_KEY_API_KEYS) ?? "{}"); } catch {}

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (keys.groq) headers["X-Groq-Key"] = keys.groq;
  if (keys.google) headers["X-Google-Key"] = keys.google;
  if (keys.openrouter) headers["X-OpenRouter-Key"] = keys.openrouter;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/tailor/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (e) {
    onError(e instanceof Error ? e.message : "Network error");
    return;
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Request failed" }));
    onError(err.detail ?? "Tailoring request failed");
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split on double-newline (SSE event boundary)
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const chunk of events) {
      const dataLine = chunk.trim();
      if (!dataLine.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(dataLine.slice(6));
        if (event.type === "progress") onProgress(event as TailorProgress);
        else if (event.type === "done") onDone(event.result as TailoredResume);
        else if (event.type === "error") onError(event.message ?? "Tailoring failed");
      } catch { /* ignore malformed events */ }
    }
  }
}

export const getTailoredResume = (id: string) =>
  api.get(`/tailor/${id}`).then((r) => r.data);

// ---- Email ----
export const generateEmails = (payload: {
  tailor_id: string;
  provider: string;
  model_key: string;
}) => api.post("/emails/generate", payload, { timeout: 180_000 }).then((r) => r.data);

export const getCachedEmails = () =>
  api.get("/emails/cache").then((r) => r.data);

export const getEmailsForTailor = (tailorId: string) =>
  api.get(`/emails/for-tailor/${tailorId}`).then((r) => r.data);

// ---- Download ----
export const downloadDocx = (id: string) =>
  api.get(`/download/${id}/docx`, { responseType: "blob" }).then((r) => r.data);

export const downloadPdf = (id: string) =>
  api.get(`/download/${id}/pdf`, { responseType: "blob" }).then((r) => r.data);

export const downloadZip = (id: string) =>
  api.get(`/download/${id}/zip`, { responseType: "blob" }).then((r) => r.data);

export const downloadTxt = (id: string) =>
  api.get(`/download/${id}/txt`, { responseType: "blob" }).then((r) => r.data);

// ---- LLM ----
export const getLLMProviders = () =>
  api.get("/llm/providers").then((r) => r.data);

export const validateKey = (provider: string, key: string) =>
  api.post("/llm/validate-key", { provider, key }).then((r) => r.data);

// ---- Projects ----
export const getProjects = () =>
  api.get("/projects/").then((r) => r.data);

export const createProject = (project: { name: string; bullets: string[]; skills: string[] }) =>
  api.post("/projects/", project).then((r) => r.data);

export const updateProject = (id: string, project: { name?: string; bullets?: string[]; skills?: string[] }) =>
  api.put(`/projects/${id}`, project).then((r) => r.data);

export const deleteProject = (id: string) =>
  api.delete(`/projects/${id}`).then((r) => r.data);

export const selectProjectsForJD = (jdId: string, topN: number = 2) =>
  api.post(`/projects/select?jd_id=${encodeURIComponent(jdId)}&top_n=${topN}`).then((r) => r.data);

export const rewriteProjectBullets = (
  projectId: string,
  jdId: string,
  provider: string,
  modelKey: string
) =>
  api.post(
    `/projects/rewrite-bullets?project_id=${encodeURIComponent(projectId)}&jd_id=${encodeURIComponent(jdId)}&provider=${encodeURIComponent(provider)}&model_key=${encodeURIComponent(modelKey)}`
  ).then((r) => r.data);

export const getCachedTailored = () =>
  api.get("/tailor/cache").then((r) => r.data);

export const patchJD = (
  id: string,
  patch: Partial<{ job_title: string; company: string; location: string; required_skills: string[]; preferred_skills: string[]; keywords_to_match: string[]; required_experience_years: number }>
) => api.patch(`/jd/cache/${id}`, patch).then((r) => r.data);

export const patchResume = (
  id: string,
  patch: Partial<{ skills: string[]; summary: string; tagline: string }>
) => api.patch(`/resumes/cache/${id}`, patch).then((r) => r.data);

export const getScoreComparison = (tailorId: string) =>
  api.get(`/tailor/${tailorId}/score-comparison`).then((r) => r.data);

// ---- Google Drive ----
export const getDriveAuthUrl = () =>
  api.get("/resumes/drive/auth-url").then((r) => r.data);

export const sendDriveAuthCode = (code: string) =>
  api.post(`/resumes/drive/callback?code=${encodeURIComponent(code)}`).then((r) => r.data);

export const getDriveStatus = () =>
  api.get("/resumes/drive/status").then((r) => r.data);

export const disconnectDrive = () =>
  api.post("/resumes/drive/disconnect").then((r) => r.data);

export const listDriveFiles = (folderLink: string) =>
  api.post(`/resumes/drive/list-files?folder_link=${encodeURIComponent(folderLink)}`).then((r) => r.data);

export const importFromDrive = (folderLink: string, provider: string, modelKey: string) =>
  api.post("/resumes/drive/import", {
    folder_link: folderLink,
    provider,
    model_key: modelKey,
  }, {
    headers: {
      "X-LLM-Provider": provider,
      "X-LLM-Model": modelKey,
    },
    timeout: 600_000, // 10 min — downloading + parsing multiple files
  }).then((r) => r.data);
