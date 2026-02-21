# AI Resume Tailor — Complete System Plan

## Overview

An end-to-end AI-powered pipeline that accepts a job description (via URL or raw text) and multiple resumes (via file upload or Google Drive folder link), ranks them by ATS match score, tailors the best-matching resume section-by-section, generates a DOCX/PDF output, re-scores it, drafts two cold emails, and organizes all outputs into a named folder for download.

---

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Project bank management | **UI page** to add/edit/remove projects (name, bullets, skills) → stored in `project_bank.yaml` | Better UX than manual YAML editing |
| Resume tailoring UX | **Download-only** — no in-browser editing. User downloads DOCX/PDF and does final touch-ups locally | Keep MVP simple |
| Cold email names | **Placeholders** (`[Recruiter Name]`, `[Hiring Manager Name]`) | User fills in manually |
| Resume selection after ranking | **Auto-select top-scoring** resume and proceed | Streamlined flow |
| DOCX template | **Single template (classic)** for MVP | One polished template > two mediocre ones |
| Google Drive file filtering | Backend filters folder contents to **only .pdf and .docx files**, skips everything else | Drive folders may contain mixed files |
| Build approach | **Phased** — discussed separately in detail | Incremental delivery |

---

## Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite | Flexible, component-based, modern |
| UI Library | Tailwind CSS + shadcn/ui | Fast to build, clean design |
| State Management | TanStack Query (React Query) | API calls, caching, loading states |
| Backend API | FastAPI (Python) | Async, auto OpenAPI docs, full Python ecosystem |
| LLM Interface | LiteLLM | Unified API for all providers, built-in rate limit handling |
| Vector DB | ChromaDB (local, persistent) | Zero-config, MVP-ready, swap to Qdrant Cloud later |
| Embeddings | sentence-transformers (`all-MiniLM-L6-v2`) | Free, fast, runs locally |
| ATS Scoring | spaCy TF-IDF + sentence-transformers | Hybrid keyword + semantic scoring |
| PDF Parsing | pdfplumber | Most reliable for resume PDFs |
| DOCX R/W | python-docx | Read input + generate ATS-optimized output |
| PDF Generation | LibreOffice CLI (`docx2pdf`) | Pixel-perfect DOCX → PDF conversion |
| Job URL Scraping | Playwright | Handles JS-heavy job boards (LinkedIn, Greenhouse, Workday) |
| Google Drive | Google Drive API v3 + OAuth2 | Folder access, file listing, download |
| Config/Secrets | python-dotenv | API keys management |
| Data Store | YAML/JSON files | Project bank, skill synonyms, templates |
| Build Tooling | Vite (frontend) + uvicorn (backend) | Fast dev servers |

---

## Free LLM Models (7 Models, 3 API Keys)

User selects their model from a dropdown. On rate limit, the app surfaces the error and prompts the user to switch.

### API Keys Required

| Provider | Key Source | Models Unlocked |
|---|---|---|
| Groq | console.groq.com | 3 models |
| Google AI Studio | ai.google.dev | 2 models |
| OpenRouter | openrouter.ai | 2 models |

### Model Lineup

| # | Model | Provider | Quality | Best For |
|---|---|---|---|---|
| 1 | **LLaMA 3.3 70B** | Groq | ⭐ Excellent | Default — best all-rounder for resume writing |
| 2 | **DeepSeek R1 Distill LLaMA 70B** | Groq | Excellent | JD analysis, reasoning, project selection |
| 3 | **Qwen QwQ 32B** | Groq | Very good | Fast reasoning, keyword extraction |
| 4 | **Gemini 2.0 Flash** | Google | Very good | Most reliable structured output, concise writing |
| 5 | **Gemini 1.5 Flash** | Google | Good | Fallback when 2.0 hits rate limits |
| 6 | **DeepSeek R1 0528** | OpenRouter | Excellent | Deep reasoning, JD strategy |
| 7 | **Kimi K2** | OpenRouter | Very good | Best for tech-heavy roles |

### Rate Limit UX

```
┌──────────────────────────────────────────────────┐
│  ⚠️ LLaMA 3.3 70B (Groq) rate limit reached.    │
│  Please select another model to continue.        │
│                                                  │
│  Suggested: [DeepSeek R1 0528 (OpenRouter)]      │
│             [Gemini 2.0 Flash (Google)]          │
│                                                  │
│  [Switch Model]              [Retry in 60s]      │
└──────────────────────────────────────────────────┘
```

---

## Input Modes

### Job Description Input (2 modes)

| Mode | How |
|---|---|
| **URL** | User pastes job posting link (LinkedIn, Greenhouse, Lever, etc.). Playwright scrapes the page, extracts job title, company name, and full description. |
| **Text** | User pastes raw JD text. LLM parses out job title, company, requirements. |

### Resume Input (2 modes)

| Mode | How |
|---|---|
| **File Upload** | User uploads multiple PDF/DOCX files via drag-drop. |
| **Google Drive** | User provides a Drive folder link. Backend authenticates via OAuth2, lists all PDF/DOCX files in folder, downloads them for processing. |

---

## Vector DB Caching Layer (ChromaDB)

Avoids reprocessing resumes on every run.

### Flow

1. Parse resume → extract text + structured sections
2. Generate embeddings (sentence-transformers)
3. Store in ChromaDB: embedding + metadata (file name, file hash, parsed sections, source, last modified)
4. On subsequent runs: compare file hashes → only process new/modified resumes
5. For ATS scoring: query ChromaDB with JD embedding → ranked results instantly

### Stored Per Resume

```
Collection: "resumes"
├── embedding: [768-dim vector]
├── document: full extracted text
└── metadata:
    ├── file_name, file_hash (MD5 for change detection)
    ├── source: "google_drive" | "local_upload"
    ├── drive_file_id (if from Drive)
    ├── last_modified
    ├── parsed_sections: {name, tagline, summary, skills, experience, projects}
    └── section_embeddings: {summary, skills, experience} (for granular matching)
```

### Persistence

- Stored at `./data/chroma_db/` (gitignored)
- Section-level + full-resume embeddings for both quick ranking and granular matching
- Project bank also stored in ChromaDB as a separate collection

### Future Migration Path

| MVP (Now) | Production (Later) |
|---|---|
| ChromaDB (local) | Qdrant Cloud (free tier, 1 GB) |
| Just change `vector_store.py` | Everything else stays the same |

---

## ATS Scoring Engine

Mirrors real-world ATS behavior (Workday, Greenhouse, Taleo, etc.).

### Scoring Formula (Weighted)

| Component | Weight | Method |
|---|---|---|
| Required skills match % | 35% | Keyword extraction + synonym matching |
| Preferred skills match % | 15% | Same, lower weight |
| Job title similarity | 20% | Semantic similarity (embeddings) |
| Experience relevance | 15% | Bullet point similarity to JD responsibilities |
| Years of experience fit | 10% | Date range parsing |
| Education match | 5% | Degree + field check |

### Features

- **Synonym matching**: Curated dictionary (`skill_synonyms.json`) + LLM fallback (e.g., "K8s" ↔ "Kubernetes")
- **Knockout alerts**: `⚠️ Required skill 'AWS' not found in your resume`
- **Two-stage ranking**: Quick vector similarity (top K) → detailed keyword scoring (top 5)
- **Before/after comparison**: Show score improvement after tailoring

---

## Resume Output Strategy (DOCX-First)

DOCX is the primary format for best ATS parseability. PDF is derived from DOCX.

### ATS-Optimized DOCX Rules

| Rule | Implementation |
|---|---|
| Word's built-in heading styles | `Heading 1` for name, `Heading 2` for sections |
| Single column only | No tables, no columns, no text boxes |
| Standard section titles | "Professional Experience", "Skills", "Education", "Projects" |
| Bullet points as `List Bullet` style | Not manual dashes or `•` characters |
| Name/email/phone in body | NOT in header/footer (many ATS skip headers) |
| No images, icons, graphics | Pure text |
| Standard fonts | Calibri, Arial, or Times New Roman |
| Font size 10-12pt | Body 10.5-11pt, Name 14-16pt, Headings 12pt |
| Margins 0.5-0.75 inch | Maximizes space |
| Skills as comma-separated text | Not tags, badges, or pills |
| File name convention | `FirstName_LastName_Resume.docx` |

### Output Flow

```
Structured Resume Data (JSON)
    │
    ├──► DOCX (python-docx) — PRIMARY, ATS-optimized
    ├──► PDF (LibreOffice converts from DOCX) — pixel-perfect derivative
    └──► Cold Emails + ATS Report — as DOCX/text
```

### Single Page Enforcement

1. LLM prompt constraints: "Each bullet 1-2 lines max, 3-4 bullets per role"
2. Character budget per section (pre-computed per template)
3. Post-generation check: convert to PDF → check page count (PyPDF2) → if >1 page, send to Content Shortener prompt → regenerate

### DOCX Template (Single — MVP)

```
templates/
└── classic.py          # Calibri, traditional layout, margins, page setup, all styles
```

One Python builder function: takes structured resume data (dict) → returns `python-docx` Document. Additional templates can be added later by creating new builder files.

---

## Frontend Pages

### Main Flow (4-Step Wizard)

| Step | Page | Purpose |
|---|---|---|
| 1 | **Input Page** | JD input (URL or text) + resume upload (files or Drive link) |
| 2 | **Ranking Page** | Table of all resumes with ATS scores, breakdown, knockout alerts. Top-scoring resume is auto-selected. |
| 3 | **Processing Page** | Shows progress: tailoring sections → generating emails → building DOCX → converting PDF. Loading states per step. |
| 4 | **Download Page** | Download buttons: Resume DOCX, Resume PDF, Cold Emails DOCX, ATS Report, Download All (ZIP). Before/after ATS score comparison shown here. |

### Standalone Pages

| Page | Purpose |
|---|---|
| **Project Bank** | UI to manage projects: add new (name, bullet points, skills used), edit existing, delete. Stored in `project_bank.yaml`. |
| **Settings** | API keys (Groq, OpenRouter, Gemini) + model selector dropdown |

### Settings Page

```
┌───────────────────────────────────────┐
│  🔑 API Keys                          │
│                                       │
│  Groq:          [gsk_...________] ✅  │
│  OpenRouter:    [sk-or-...______] ✅  │
│  Google Gemini: [AIza...________] ✅  │
│                                       │
│  Only models with valid keys appear   │
│  in the provider dropdown.            │
└───────────────────────────────────────┘

Model Selector (Header)
┌──────────────────────────────────────────────┐
│  ── Groq ──                                  │
│  ⭐ LLaMA 3.3 70B           (Recommended)    │
│  • DeepSeek R1 Distill 70B  (Best reasoning) │
│  • Qwen QwQ 32B             (Fast + smart)   │
│  ── Google ──                                │
│  ⭐ Gemini 2.0 Flash         (Most reliable)  │
│  • Gemini 1.5 Flash          (Fallback)      │
│  ── OpenRouter ──                            │
│  • DeepSeek R1 0528          (Deep reasoning) │
│  • Kimi K2                   (Best for tech)  │
└──────────────────────────────────────────────┘
```

API keys stored in browser `localStorage`, sent to backend per-request.

---

## API Endpoints (FastAPI)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/jd/parse-url` | Scrape & parse JD from URL |
| POST | `/api/jd/parse-text` | Parse raw JD text |
| POST | `/api/resumes/upload` | Upload resume files |
| POST | `/api/resumes/drive` | Fetch resumes from Drive folder link |
| GET | `/api/resumes/rank?jd_id=` | Get ranked resume scores for a JD |
| POST | `/api/tailor` | Tailor top-scoring resume for a JD (auto-selected) |
| GET | `/api/tailor/{id}` | Get tailored resume content |
| POST | `/api/emails/generate` | Generate cold emails |
| GET | `/api/download/{id}/docx` | Download tailored resume as DOCX |
| GET | `/api/download/{id}/pdf` | Download tailored resume as PDF |
| GET | `/api/download/{id}/zip` | Download all outputs as ZIP |
| GET | `/api/llm/providers` | List available providers (based on keys sent) |
| POST | `/api/llm/validate-key` | Test if an API key works |
| GET | `/api/projects` | List all projects from project bank |
| POST | `/api/projects` | Add a new project (name, bullets, skills) |
| PUT | `/api/projects/{id}` | Update an existing project |
| DELETE | `/api/projects/{id}` | Delete a project |

---

## Error Handling

| Error | Backend Response | Frontend Behavior |
|---|---|---|
| Rate limited (429) | `{ "error": "rate_limited", "provider": "gemini", "retry_after": 60 }` | Warning banner + switch model prompt |
| Invalid API key | `{ "error": "invalid_key", "provider": "groq" }` | Error on settings page |
| LLM JSON parse failure | Retry once with temperature +0.1 | Transparent retry, then error toast |
| Generic LLM error | `{ "error": "llm_error", "message": "..." }` | Error toast with retry button |

---

## Prompt Engineering Strategy

### Core Principles

- **Structured JSON output**: Every prompt returns parseable JSON
- **Role-based system prompts**: Each task gets a specialized persona
- **Section-by-section**: One prompt per section for better quality and control
- **JD context in every prompt**: LLM always has the target JD
- **Constraints over instructions**: Specific rules ("1-2 lines, start with action verb, include metrics") > vague guidance
- **Few-shot examples**: 1-2 examples of ideal output per prompt

### Prompt Catalog (10 Prompts)

#### Prompt 1: JD Parser & Classifier

```
System: You are an expert job description analyst for the tech industry.

Input: Raw JD text
Output JSON:
{
  "job_title": "Senior Backend Engineer",
  "company": "Stripe",
  "location": "San Francisco, CA (Hybrid)",
  "jd_type": "java_backend",  // java_backend | python_backend | ai_ml | frontend | fullstack | new_grad
  "required_skills": ["Java", "Spring Boot", "AWS", "PostgreSQL"],
  "preferred_skills": ["Kubernetes", "Kafka", "GraphQL"],
  "required_experience_years": 5,
  "education": "Bachelor's in CS or equivalent",
  "key_responsibilities": ["Design microservices...", "Lead team of..."],
  "keywords_to_match": ["distributed systems", "high availability", "API design"]
}
```

- Temperature: 0.1 | Max tokens: 1500 | JSON mode: strict
- Explicitly define `jd_type` enum, separate required vs. preferred skills

#### Prompt 2: Resume Section Extractor

```
System: You are a resume parsing expert. Extract each section precisely.
Do not infer, add, or modify any content — extract exactly as written.

Input: Raw resume text
Output JSON:
{
  "name": "John Doe",
  "contact": {"email": "...", "phone": "...", "linkedin": "...", "location": "..."},
  "tagline": "Full Stack Developer | Cloud Enthusiast | ...",
  "summary": "5+ years of experience...",
  "skills": ["Python", "React", "AWS", ...],
  "experience": [
    {
      "title": "Software Engineer",
      "company": "Google",
      "dates": "Jan 2022 - Present",
      "bullets": ["Built...", "Led...", "Reduced..."]
    }
  ],
  "projects": [
    {
      "name": "Project X",
      "technologies": ["React", "Node.js"],
      "bullets": ["Developed...", "Implemented..."]
    }
  ],
  "education": [{"degree": "B.S. Computer Science", "school": "MIT", "year": "2020"}],
  "certifications": ["AWS Solutions Architect"]
}
```

- Temperature: 0.1 | Max tokens: 2000 | JSON mode: strict
- "Extract only, don't modify" — preserves original content

#### Prompt 3: Tagline Generator

```
System: You are a personal branding expert who writes resume taglines
that immediately grab recruiter attention.

Rules:
- 3-4 phrases separated by " | "
- Pull exact phrases/keywords from the job description
- Keep each phrase 2-4 words
- First phrase = strongest role match

Input: {parsed_jd}, {current_tagline}
Output JSON:
{
  "tagline": "Senior Backend Engineer | Distributed Systems | Cloud-Native Architecture | API Design"
}
```

- Temperature: 0.7 | Max tokens: 200
- Few-shot example included showing JD → tagline transformation

#### Prompt 4: Summary Rewriter

```
System: You are an expert resume writer specializing in professional summaries.

Rules:
- Maximum 3 sentences, 40-60 words total
- Sentence 1: years of experience + core expertise matching JD
- Sentence 2: 2-3 key achievements with metrics
- Sentence 3: what you bring to THIS specific role
- Weave in 3-5 keywords from the JD naturally
- Do NOT use "I"
- Tone: confident, specific, metric-driven

Input: {parsed_jd}, {current_summary}, {candidate_skills}, {experience_years}
Output JSON:
{
  "summary": "Backend engineer with 5+ years building distributed systems..."
}
```

- Temperature: 0.5 | Max tokens: 300

#### Prompt 5: Skills Section Editor

```
System: You are an ATS optimization expert for resume skills sections.

Rules:
- Include ALL required skills from JD
- Include preferred skills the candidate actually has
- Group into categories: Languages, Frameworks, Cloud/DevOps, Databases, Tools
- Remove skills irrelevant to this JD
- Use EXACT terminology from the JD
- Maximum 4 categories, 6-8 skills per category

Input: {parsed_jd}, {current_skills}, {jd_required_skills}, {jd_preferred_skills}
Output JSON:
{
  "skills": {
    "Languages": "Java, Python, SQL, TypeScript",
    "Frameworks": "Spring Boot, Hibernate, React, GraphQL",
    "Cloud & DevOps": "AWS (EC2, S3, Lambda), Kubernetes, Docker, Terraform",
    "Databases": "PostgreSQL, Redis, DynamoDB, Kafka"
  },
  "added_from_jd": ["GraphQL", "Terraform", "Kafka"],
  "removed": ["MATLAB", "Unity"]
}
```

- Temperature: 0.1 | Max tokens: 500 | JSON mode: strict
- Returns `added_from_jd` and `removed` for user transparency

#### Prompt 6: Experience Bullet Rewriter

```
System: You are a senior resume writer who specializes in {jd_type} roles.

Rules:
- XYZ formula: "Accomplished [X] by doing [Y], resulting in [Z]"
- Start every bullet with strong action verb
- Include quantifiable metrics (%, $, users, latency, throughput)
- Weave in JD keywords naturally — at least 1 keyword per bullet
- Each bullet under 120 characters
- Max 4 bullets (recent role), 2-3 (older roles)
- Preserve truthful content — enhance framing, don't fabricate
- JD type adaptations:
  - java_backend: microservices, APIs, scalability, system design
  - python_backend: data pipelines, automation, APIs
  - ai_ml: models, accuracy metrics, datasets, production ML
  - frontend: UI/UX, performance, component architecture
  - fullstack: end-to-end ownership
  - new_grad: projects, coursework, internships, learning velocity

Input: {parsed_jd}, {jd_type}, {experience_entry}, {jd_keywords}
Output JSON:
{
  "company": "Google",
  "title": "Software Engineer",
  "dates": "Jan 2022 - Present",
  "bullets": ["Architected...", "Optimized...", "Spearheaded...", "Mentored..."],
  "keywords_used": ["microservices", "Java", "Spring Boot", "PostgreSQL"]
}
```

- Temperature: 0.5 | Max tokens: 1500
- `jd_type` in system prompt changes LLM framing

#### Prompt 7: Project Selector

```
System: You are a technical recruiter evaluating project relevance.

Rules:
- Score each project 0-100 based on tech overlap + domain match with JD
- Select top 2 projects
- Rewrite bullets for each selected project aligned with JD

Input: {parsed_jd}, {project_bank}
Output JSON:
{
  "rankings": [
    {"project": "Distributed Cache System", "score": 92, "reason": "..."},
    {"project": "E-commerce Platform", "score": 78, "reason": "..."}
  ],
  "selected": [
    {"name": "Distributed Cache System", "bullets": ["...", "..."]},
    {"name": "E-commerce Platform", "bullets": ["...", "..."]}
  ]
}
```

- Temperature: 0.3 | Max tokens: 1500

#### Prompt 8: Content Shortener (Overflow Handler)

```
System: You are a concise editor. Shorten resume content while preserving impact.

Rules:
- Reduce by approximately {reduction_percent}%
- Cut least impactful bullets first (generic, no metrics, not JD-aligned)
- Never remove: name, contact, skills, most recent role
- Priority: metrics > JD keywords > recent experience

Input: {current_sections}, {target_reduction_percent}, {jd_keywords}
Output JSON:
{
  "shortened_sections": { ... },
  "changes_made": ["Removed bullet 3 from Role 2...", "Shortened summary..."]
}
```

- Temperature: 0.2 | Max tokens: 1500

#### Prompt 9: Cold Email — Recruiter

```
System: You are a career coach who writes cold emails that get responses from recruiters.

Rules:
- Subject line: concise, mentions role + unique hook
- 4-6 sentences max
- Tone: professional, warm, confident — not desperate
- Focus on IMPACT and RESULTS, not technical details
- 1-2 specific achievements with numbers
- Reference company name and role
- Soft call to action
- NO technical jargon

Input: {parsed_jd}, {tailored_resume_summary}, {top_achievements}
Output JSON:
{
  "subject": "Senior Backend Engineer — Scaled APIs to 10M+ Requests/Day",
  "body": "Hi [Recruiter Name],\n\n..."
}
```

- Temperature: 0.7 | Max tokens: 500

#### Prompt 10: Cold Email — Hiring Manager

```
System: You are a career coach who writes cold emails that impress engineering hiring managers.

Rules:
- Subject line: technical hook + role
- 5-7 sentences
- Tone: technically credible, peer-to-peer
- Reference specific technical challenges from JD
- Mention relevant tech stack with depth
- Show you understand their team's problems
- Offer to discuss technical approach

Input: {parsed_jd}, {tailored_resume_summary}, {relevant_experience}, {jd_type}
Output JSON:
{
  "subject": "Re: Senior Backend Eng — Experience with Distributed Systems at Scale",
  "body": "Hi [Hiring Manager Name],\n\n..."
}
```

- Temperature: 0.6 | Max tokens: 600

### Quality Control

| Technique | Where Applied |
|---|---|
| JSON schema validation (Pydantic) | Every LLM response — retry once if malformed |
| Keyword coverage check | After experience rewriting — if <70% JD keywords covered → re-prompt with missing list |
| Character/word count check | Summary ≤ 60 words, bullets ≤ 120 chars — overflow → Content Shortener |
| Diff tracking | Every prompt returns `added_from_jd`, `removed`, `keywords_used` for transparency |
| Retry with temperature bump | If JSON parsing fails → retry with temperature +0.1 |

---

## Project Folder Structure

```
Job_Search/
├── frontend/                       # React + TypeScript
│   ├── public/
│   ├── src/
│   │   ├── api/                    # API client functions
│   │   │   ├── jdApi.ts
│   │   │   ├── resumeApi.ts
│   │   │   ├── tailorApi.ts
│   │   │   ├── downloadApi.ts
│   │   │   └── projectApi.ts       # Project bank CRUD
│   │   ├── components/
│   │   │   ├── jd/
│   │   │   │   ├── JdUrlInput.tsx
│   │   │   │   └── JdTextInput.tsx
│   │   │   ├── resume/
│   │   │   │   ├── ResumeUploader.tsx
│   │   │   │   ├── DriveLinker.tsx
│   │   │   │   └── ResumeRankingTable.tsx
│   │   │   ├── scoring/
│   │   │   │   ├── KnockoutAlerts.tsx      # Missing required skills warnings
│   │   │   │   └── ScoreComparison.tsx     # Before/after ATS score
│   │   │   ├── download/
│   │   │   │   └── DownloadPanel.tsx        # DOCX, PDF, ZIP download buttons
│   │   │   ├── projects/
│   │   │   │   ├── ProjectForm.tsx          # Add/edit project form (name, bullets, skills)
│   │   │   │   └── ProjectList.tsx          # List all projects with edit/delete
│   │   │   └── common/
│   │   │       ├── Stepper.tsx
│   │   │       └── LoadingSpinner.tsx
│   │   ├── pages/
│   │   │   ├── InputPage.tsx
│   │   │   ├── RankingPage.tsx
│   │   │   ├── ProcessingPage.tsx
│   │   │   ├── DownloadPage.tsx
│   │   │   ├── ProjectBankPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   └── vite.config.ts
│
├── backend/                        # FastAPI + Python
│   ├── app/
│   │   ├── main.py                 # FastAPI entry, CORS, router mounting
│   │   ├── config.py               # Settings, API keys, model registry
│   │   │
│   │   ├── api/                    # Route handlers
│   │   │   ├── jd_routes.py
│   │   │   ├── resume_routes.py
│   │   │   ├── tailor_routes.py
│   │   │   ├── email_routes.py
│   │   │   ├── download_routes.py
│   │   │   ├── llm_routes.py
│   │   │   └── project_routes.py   # CRUD for project bank
│   │   │
│   │   ├── services/               # Core business logic
│   │   │   ├── jd_parser.py        # URL scraping (Playwright) + text parsing
│   │   │   ├── resume_parser.py    # PDF/DOCX → structured data
│   │   │   ├── drive_service.py    # Google Drive API: auth, list, download
│   │   │   ├── embedding_service.py # Generate embeddings (sentence-transformers)
│   │   │   ├── vector_store.py     # ChromaDB operations: store, query, dedup
│   │   │   ├── ats_scorer.py       # Hybrid scoring: keyword + semantic + weighted
│   │   │   ├── llm_service.py      # LiteLLM wrapper: provider config, routing
│   │   │   ├── tailor_service.py   # LLM-driven section-by-section tailoring
│   │   │   ├── email_service.py    # LLM-driven cold email generation
│   │   │   ├── docx_generator.py   # python-docx resume builder
│   │   │   ├── pdf_generator.py    # DOCX → PDF via LibreOffice CLI
│   │   │   ├── output_packager.py  # Bundle outputs into named folder + ZIP
│   │   │   └── project_bank_service.py  # CRUD operations on project_bank.yaml
│   │   │
│   │   ├── models/                 # Pydantic schemas
│   │   │   ├── jd_models.py
│   │   │   ├── resume_models.py
│   │   │   ├── score_models.py
│   │   │   ├── tailor_models.py
│   │   │   └── email_models.py
│   │   │
│   │   ├── prompts/                # LLM prompt templates
│   │   │   ├── base.py             # Shared helpers
│   │   │   ├── jd_parser.py
│   │   │   ├── resume_extractor.py
│   │   │   ├── tailor_tagline.py
│   │   │   ├── tailor_summary.py
│   │   │   ├── tailor_skills.py
│   │   │   ├── tailor_experience.py
│   │   │   ├── project_selector.py
│   │   │   ├── content_shortener.py
│   │   │   ├── email_recruiter.py
│   │   │   └── email_hiring_manager.py
│   │   │
│   │   ├── templates/              # DOCX resume templates
│   │   │   └── classic.py          # Single MVP template (Calibri, traditional)
│   │   │
│   │   └── utils/
│   │       ├── synonym_map.py
│   │       ├── text_cleanup.py
│   │       └── file_hash.py
│   │
│   ├── data/
│   │   ├── chroma_db/              # ChromaDB persistent storage (gitignored)
│   │   ├── project_bank.yaml       # User's maintained project bank
│   │   ├── skill_synonyms.json     # Curated synonym dictionary
│   │   └── outputs/                # Generated output folders (gitignored)
│   │       └── {Job Position} - {Company}/
│   │           ├── resume.docx
│   │           ├── resume.pdf
│   │           ├── cold_emails.docx
│   │           └── ats_report.txt
│   │
│   ├── requirements.txt
│   └── .env                        # API keys (gitignored)
│
├── .gitignore
├── README.md
├── Makefile                        # dev commands: make run-frontend, make run-backend, make run-all
└── idea.txt
```

---

## Module Dependency Flow

```
JD Input → jd_parser → parsed JD
                            │
Resume Input → resume_parser ──► embedding_service ──► vector_store (ChromaDB)
       │                                                      │
  drive_service (if Drive link)                               │
                                                              ▼
                                              ats_scorer (JD + resume embeddings + keywords)
                                                              │
                                                              ▼
                                                    Ranked resumes + knockout alerts
                                                              │
                                                              ▼
                                              tailor_service (LLM, section-by-section)
                                                              │
                                                    ┌─────────┴──────────┐
                                                    ▼                    ▼
                                            docx_generator         email_service
                                                    │                    │
                                            pdf_generator                │
                                                    │                    │
                                                    └────────┬───────────┘
                                                             ▼
                                                      output_packager → ZIP download
```

---

## Output Organization

For each job application, create:

```
{Job Position} - {Company Name}/
├── FirstName_LastName_Resume.docx     # ATS-optimized DOCX
├── FirstName_LastName_Resume.pdf      # PDF (converted from DOCX)
├── cold_emails.docx                   # Both emails in one doc
└── ats_analysis.txt                   # Before/after scores + breakdown + knockout alerts
```

All files downloadable individually or as a single ZIP.

---

## Build Phases (10 Checkpoints)

Each phase produces a working, testable checkpoint. Verify the output before moving on to the next phase.

### Phase 1: Project Foundation & Skeleton
**Goal**: Both servers running, connected, health-check working

**Backend tasks**:
- FastAPI app scaffolding (`main.py`, CORS, router structure)
- `config.py` with model registry and settings
- `.env` template with all required keys
- All Pydantic models defined upfront (`jd_models.py`, `resume_models.py`, `score_models.py`, `tailor_models.py`, `email_models.py`)
- `requirements.txt` with all dependencies

**Frontend tasks**:
- Vite + React + TypeScript project init
- Tailwind CSS + shadcn/ui setup
- App shell with routing (all pages as empty placeholders)
- Stepper component for the 4-step wizard
- API client base setup (axios instance with base URL)

**Infrastructure tasks**:
- `Makefile` with `run-frontend`, `run-backend`, `run-all` commands
- `.gitignore` (chroma_db, outputs, .env, node_modules)
- Basic `README.md`

**✅ Checkpoint Test**: Run `make run-all` → frontend loads on `:5173`, backend responds on `:8000/docs` (FastAPI Swagger UI)

---

### Phase 2: LLM Service + Settings Page
**Goal**: User can enter API keys, select a model, and verify it works

**Backend tasks**:
- `llm_service.py` — LiteLLM wrapper with all 7 models configured
- `llm_routes.py` — `GET /api/llm/providers`, `POST /api/llm/validate-key`
- Rate limit error detection and structured error responses

**Frontend tasks**:
- Settings page — API key input fields (Groq, OpenRouter, Gemini)
- Key validation (calls validate endpoint, shows ✅/❌)
- Model selector dropdown in header (grouped by provider, only shows valid)
- localStorage persistence for keys
- Rate limit error banner component

**✅ Checkpoint Test**: Enter a Groq API key → see ✅ → LLaMA 3.3 70B appears in dropdown → send a test prompt via Swagger → get response

---

### Phase 3: JD Input & Parsing
**Goal**: User can input a JD (URL or text) and see it parsed into structured data

**Backend tasks**:
- `jd_parser.py` — URL scraping (Playwright) + text parsing via LLM
- `jd_routes.py` — `POST /api/jd/parse-url`, `POST /api/jd/parse-text`
- JD Parser prompt (Prompt #1) implemented in `prompts/jd_parser.py`
- JD classifier (detects: java_backend, python_backend, ai_ml, frontend, fullstack, new_grad)

**Frontend tasks**:
- Input page — Tab toggle: "Paste URL" / "Paste Text"
- URL input with "Scrape" button
- Text area with "Parse" button
- Display parsed JD result (title, company, required skills, preferred skills, type)

**✅ Checkpoint Test**: Paste a LinkedIn job URL → see parsed JD with correct title, company, required/preferred skills, and JD type classification

---

### Phase 4: Resume Upload & Parsing
**Goal**: User can upload resumes and see them parsed into structured sections

**Backend tasks**:
- `resume_parser.py` — PDF (pdfplumber) + DOCX (python-docx) text extraction → LLM-based section extraction
- `resume_routes.py` — `POST /api/resumes/upload`
- Resume Extractor prompt (Prompt #2) implemented in `prompts/resume_extractor.py`
- `utils/file_hash.py` — MD5 hashing for dedup
- `utils/text_cleanup.py` — normalize whitespace, strip unicode

**Frontend tasks**:
- Input page — Resume upload section with drag-drop (accept .pdf, .docx, multiple files)
- Upload progress indicators
- Show count of successfully parsed resumes

**✅ Checkpoint Test**: Upload 3 PDF resumes → all parsed successfully → structured data visible in API response (name, skills, experience, etc.)

> **Note**: Phase 3 and Phase 4 can be built in parallel since they are independent.

---

### Phase 5: ATS Scoring & Ranking
**Goal**: Uploaded resumes are ranked against the parsed JD with score breakdown

**Backend tasks**:
- `embedding_service.py` — sentence-transformers embeddings for JD + resumes
- `vector_store.py` — ChromaDB setup, store/query operations, hash-based dedup
- `ats_scorer.py` — weighted scoring formula (required skills 35%, preferred 15%, title 20%, experience 15%, years 10%, education 5%)
- `utils/synonym_map.py` — skill synonym dictionary
- `resume_routes.py` — `GET /api/resumes/rank?jd_id=`
- Knockout alert detection (missing required skills)

**Frontend tasks**:
- Ranking page — table with columns: Resume Name, Overall Score %, Required Skills %, Title Match %, breakdown bars
- Knockout alerts section (`⚠️ Required skill 'AWS' not found`)
- Top-scoring resume auto-highlighted with ⭐
- "Proceed with Top Resume" button (auto-selected)

**Data files**:
- `skill_synonyms.json` — initial curated dictionary (50-100 common synonyms)

**✅ Checkpoint Test**: Upload 3 resumes + parse a JD → ranking page shows all 3 scored and sorted → knockout alerts visible → top resume auto-selected

---

### Phase 6: Resume Tailoring Pipeline
**Goal**: Top-scoring resume is tailored section-by-section for the JD

**Backend tasks**:
- `tailor_service.py` — orchestrates all tailoring prompts in sequence
- All tailoring prompts implemented:
  - `prompts/tailor_tagline.py` (Prompt #3)
  - `prompts/tailor_summary.py` (Prompt #4)
  - `prompts/tailor_skills.py` (Prompt #5)
  - `prompts/tailor_experience.py` (Prompt #6)
  - `prompts/content_shortener.py` (Prompt #8)
- `tailor_routes.py` — `POST /api/tailor`, `GET /api/tailor/{id}`
- JSON schema validation (Pydantic) for every LLM response with retry logic
- Keyword coverage check after experience rewriting

**Frontend tasks**:
- Processing page — step-by-step progress indicator:
  - ✅ Tailoring tagline...
  - ✅ Rewriting summary...
  - ⏳ Optimizing skills...
  - ⬜ Rewriting experience...
  - ⬜ Generating files...
- Error handling: if a step fails, show which step + retry button

**✅ Checkpoint Test**: Click "Proceed" on ranking page → processing page shows each step completing → tailored content returned in API with `keywords_used`, `added_from_jd` fields

---

### Phase 7: Project Bank & Project Selection
**Goal**: User can manage projects, and the system selects best 2 for each JD

**Backend tasks**:
- `project_bank_service.py` — CRUD operations on `project_bank.yaml` (read, add, update, delete)
- `project_routes.py` — `GET/POST/PUT/DELETE /api/projects`
- `prompts/project_selector.py` (Prompt #7) — score and select top 2 projects
- Integrate project selection into `tailor_service.py` pipeline

**Frontend tasks**:
- Project Bank page:
  - List all projects with name, skills tags, bullet count
  - "Add Project" button → form with: project name, bullet points (dynamic add/remove), skills used (tag input)
  - Edit/delete buttons per project
- Processing page — add "Selecting projects..." step

**Data files**:
- `project_bank.yaml` — initial empty template with example structure

**✅ Checkpoint Test**: Add 5 projects in Project Bank UI → run tailoring → 2 best projects auto-selected with score + reasoning → included in tailored output

---

### Phase 8: DOCX/PDF Generation & Download
**Goal**: Tailored resume is generated as DOCX + PDF, available for download

**Backend tasks**:
- `docx_generator.py` — python-docx builder implementing all ATS rules (Heading styles, List Bullet, single column, Calibri, margins)
- `templates/classic.py` — the single MVP template
- `pdf_generator.py` — DOCX → PDF via LibreOffice CLI
- Single page enforcement: check page count → content shortener if needed → regenerate
- `download_routes.py` — `GET /api/download/{id}/docx`, `/pdf`

**Frontend tasks**:
- Download page:
  - "Download Resume (DOCX)" button
  - "Download Resume (PDF)" button
  - File size shown next to each button

**✅ Checkpoint Test**: Full pipeline runs → download DOCX → open in Word → single page, correct formatting, all ATS rules followed → PDF matches DOCX exactly

---

### Phase 9: Cold Emails & Output Packaging
**Goal**: Cold emails generated, all outputs bundled into a named folder as ZIP

**Backend tasks**:
- `email_service.py` — orchestrates both email prompts
- `prompts/email_recruiter.py` (Prompt #9)
- `prompts/email_hiring_manager.py` (Prompt #10)
- Cold emails saved as `cold_emails.docx`
- ATS report generated: `ats_analysis.txt` (before/after scores, breakdown, knockout alerts, keywords added)
- `output_packager.py` — creates `{Job Position} - {Company}/` folder, bundles all files, creates ZIP
- `download_routes.py` — `GET /api/download/{id}/zip`

**Frontend tasks**:
- Download page additions:
  - "Download Cold Emails (DOCX)" button
  - "Download ATS Report" button
  - "Download All (ZIP)" button
  - Before/after ATS score comparison display

**✅ Checkpoint Test**: Full end-to-end run → download ZIP → contains: `resume.docx`, `resume.pdf`, `cold_emails.docx`, `ats_analysis.txt` → all content is correct and tailored

---

### Phase 10: Google Drive Integration
**Goal**: User can provide a Drive folder link instead of uploading files

**Backend tasks**:
- `drive_service.py` — Google Drive API v3 setup:
  - OAuth2 flow (browser popup for consent)
  - Parse folder ID from shared link
  - List files in folder (filter .pdf/.docx only, skip all other file types)
  - Download each file to temp storage
  - Feed into existing `resume_parser.py` pipeline
- `resume_routes.py` — `POST /api/resumes/drive`

**Frontend tasks**:
- Input page — "Or import from Google Drive" section:
  - Text input for folder link
  - "Connect & Import" button
  - Google OAuth popup
  - Shows list of found resumes from folder with file names

**✅ Checkpoint Test**: Paste a Drive folder link with 5 mixed files → OAuth popup → app finds 3 PDFs + 1 DOCX (ignores 1 PNG) → all 4 parsed and ranked

---

### Phase Dependency Map

```
Phase 1 (Foundation)
    │
    ▼
Phase 2 (LLM Service)
    │
    ├──────────────┐
    ▼              ▼
Phase 3 (JD)   Phase 4 (Resume)──────► Phase 10 (Google Drive)
    │              │
    └──────┬───────┘
           ▼
    Phase 5 (ATS Scoring)
           │
           ▼
    Phase 6 (Tailoring)
           │
    ┌──────┼──────────┐
    ▼      ▼          ▼
Phase 7  Phase 8   Phase 9
(Projects)(DOCX)   (Emails)
```

Phases 3 & 4 can be built in parallel.
Phases 7, 8, & 9 can be built in parallel (all depend on Phase 6).
Phase 10 can be built anytime after Phase 4.

### Phase Summary Table

| Phase | Name | Depends On | Delivers |
|---|---|---|---|
| 1 | Project Foundation | — | Both servers running, schemas defined |
| 2 | LLM Service | Phase 1 | Model selection + API key management |
| 3 | JD Parsing | Phase 2 | JD input (URL/text) → structured data |
| 4 | Resume Parsing | Phase 2 | Resume upload → structured sections |
| 5 | ATS Scoring | Phase 3 + 4 | Resumes ranked with score breakdown |
| 6 | Tailoring | Phase 5 | Section-by-section resume rewriting |
| 7 | Project Bank | Phase 6 | Project management UI + auto-selection |
| 8 | DOCX/PDF | Phase 6 | Downloadable ATS-optimized resume |
| 9 | Emails & ZIP | Phase 8 | Cold emails + full output package |
| 10 | Google Drive | Phase 4 | Import resumes from Drive folder |
