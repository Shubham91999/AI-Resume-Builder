import axios from "axios";

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
      localStorage.getItem("art_api_keys") ?? "{}"
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

export const getCachedTailored = () =>
  api.get("/tailor/cache").then((r) => r.data);

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
