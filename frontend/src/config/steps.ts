import type { Step } from "@/types";

export const STEPS: Step[] = [
  {
    id: "settings",
    label: "Settings",
    description: "Configure LLM API keys",
    path: "/settings",
  },
  {
    id: "jd",
    label: "Job Description",
    description: "Paste or fetch the JD",
    path: "/jd",
  },
  {
    id: "resume",
    label: "Resume",
    description: "Upload your resume(s)",
    path: "/resume",
  },
  {
    id: "score",
    label: "Score",
    description: "ATS compatibility score",
    path: "/score",
  },
  {
    id: "tailor",
    label: "Tailor",
    description: "AI-tailored resume",
    path: "/tailor",
  },
  {
    id: "projects",
    label: "Projects",
    description: "Select best projects",
    path: "/projects",
  },
  {
    id: "email",
    label: "Email",
    description: "Generate cold email",
    path: "/email",
  },
  {
    id: "download",
    label: "Download",
    description: "Export DOCX / PDF",
    path: "/download",
  },
];
