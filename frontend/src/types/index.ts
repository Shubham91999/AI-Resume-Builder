// ============================================================
// Shared TypeScript types — mirrors backend Pydantic models
// ============================================================

// --- JD ---
export type JDType =
  | "java_backend"
  | "python_backend"
  | "ai_ml"
  | "frontend"
  | "fullstack"
  | "new_grad";

export interface ParsedJD {
  id: string;
  job_title: string;
  company: string;
  location: string | null;
  jd_type: JDType;
  required_skills: string[];
  preferred_skills: string[];
  required_experience_years: number | null;
  education: string | null;
  key_responsibilities: string[];
  keywords_to_match: string[];
  raw_text: string;
}

// --- Resume ---
export interface ContactInfo {
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  location: string | null;
}

export interface ExperienceEntry {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
}

export interface ProjectEntry {
  name: string;
  technologies: string[];
  bullets: string[];
}

export interface EducationEntry {
  degree: string;
  school: string;
  year: string | null;
}

export interface ParsedResume {
  id: string;
  file_name: string;
  file_hash: string;
  source: string;
  drive_file_id?: string;
  name: string;
  contact: ContactInfo;
  tagline: string | null;
  summary: string | null;
  skills: string[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  certifications: string[];
  raw_text: string;
}

// --- Score ---
export interface ScoreBreakdown {
  required_skills_pct: number;
  preferred_skills_pct: number;
  title_similarity_pct: number;
  experience_relevance_pct: number;
  years_experience_fit_pct: number;
  education_match_pct: number;
}

export interface KnockoutAlert {
  skill: string;
  severity: "critical" | "warning";
  message: string;
}

export interface ResumeScore {
  resume_id: string;
  resume_name: string;
  file_name: string;
  overall_score: number;
  breakdown: ScoreBreakdown;
  knockout_alerts: KnockoutAlert[];
  matched_required_skills: string[];
  missing_required_skills: string[];
  matched_preferred_skills: string[];
}

export interface RankingResponse {
  jd_id: string;
  rankings: ResumeScore[];
  top_resume_id: string;
}

export interface ScoreComparison {
  before: ResumeScore;
  after: ResumeScore;
  improvement_pct: number;
  keywords_added: string[];
}

// --- Tailor ---
export interface TailorRequest {
  jd_id: string;
  resume_id: string;
  provider: string;
  model_key: string;
}

export interface TailorProgress {
  step: string;
  step_number: number;
  total_steps: number;
  status: "in_progress" | "completed" | "failed";
  message: string | null;
}

export interface TailoredExperienceEntry {
  company: string;
  title: string;
  dates: string;
  bullets: string[];
  keywords_used: string[];
}

export interface TailoredResume {
  id: string;
  jd_id: string;
  original_resume_id: string;
  name: string;
  contact: ContactInfo;
  tagline: string;
  summary: string;
  skills: Record<string, string>;
  experience: TailoredExperienceEntry[];
  projects: ProjectEntry[];
  education: EducationEntry[];
  certifications: string[];
  skills_added: string[];
  skills_removed: string[];
  keywords_used: string[];
  keywords_coverage: number;
}

// --- Email ---
export interface GeneratedEmail {
  target: "recruiter" | "hiring_manager";
  subject: string;
  body: string;
  tips: string[];
}

export interface EmailGenerateRequest {
  tailor_id: string;
  provider: string;
  model_key: string;
}

export interface EmailGenerateResponse {
  id: string;
  tailor_id: string;
  jd_id: string;
  candidate_name: string;
  job_title: string;
  company: string;
  recruiter_email: GeneratedEmail;
  hiring_manager_email: GeneratedEmail;
}

// --- LLM ---
export interface LLMProvider {
  id: string;
  name: string;
  models: string[];
  requires_key: boolean;
}

// --- Project Bank ---
export interface ProjectBankEntry {
  id: string;
  name: string;
  bullets: string[];
  skills: string[];
}

export interface ProjectBankCreate {
  name: string;
  bullets: string[];
  skills: string[];
}

export interface SelectedProject {
  name: string;
  score: number;
  reason: string;
  bullets: string[];
}

// --- App State ---
export type StepId =
  | "settings"
  | "jd"
  | "resume"
  | "score"
  | "tailor"
  | "projects"
  | "email"
  | "download";

export interface Step {
  id: StepId;
  label: string;
  description: string;
  path: string;
}

// --- Google Drive ---
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
}

export interface DriveListResponse {
  folder_id: string;
  files: DriveFile[];
  total: number;
}

export interface DriveImportResponse {
  folder_id: string;
  total: number;
  successful: number;
  results: {
    file_name: string;
    success: boolean;
    resume_id?: string;
    name?: string;
    error?: string;
  }[];
}
