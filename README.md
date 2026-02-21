# AI Resume Tailor

A full-stack toolkit that tailors resumes to specific job descriptions, scores ATS compatibility, selects relevant projects, and generates cold outreach emails -- all powered by free-tier LLM APIs.


## Features

- **JD Parsing** -- Paste raw text or provide a URL; structured extraction via LLM
- **Resume Parsing** -- Upload PDFs; extracts contact info, experience, skills, projects, and education
- **ATS Scoring** -- Weighted keyword matching with synonym awareness, knockout alerts, and per-section breakdowns
- **Resume Tailoring** -- Rewrites tagline, summary, skills, and experience bullets section-by-section using 4+ LLM calls
- **Project Bank** -- Manage a library of projects; auto-selects the top 2 for each JD based on skill overlap
- **Cold Emails** -- Generates two emails per application: one recruiter-focused (impact/metrics), one for hiring managers (technical depth)
- **DOCX Export** -- ATS-friendly single-column resume generated with python-docx; downloadable as DOCX or ZIP bundle (resume + emails)


## LLM Providers (all free tier)

| Provider       | Models                                           |
| -------------- | ------------------------------------------------ |
| Groq           | LLaMA 3.3 70B, DeepSeek R1 Distill 70B, Qwen QwQ 32B |
| Google AI Studio | Gemini 2.0 Flash, Gemini 1.5 Flash             |
| OpenRouter     | DeepSeek R1 0528, Kimi K2                        |

API keys are stored in the browser (localStorage) and sent per-request via headers. The server never persists keys.


## Tech Stack

| Layer     | Technology                                         |
| --------- | -------------------------------------------------- |
| Frontend  | React 19, TypeScript, Vite, Tailwind CSS v4        |
| Backend   | FastAPI, Python 3.11, Pydantic v2, Uvicorn         |
| LLM       | LiteLLM (unified multi-provider interface)         |
| Scoring   | Weighted keyword matching, synonym map             |
| Documents | python-docx (DOCX generation), pdfplumber (PDF parsing) |


## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- At least one free API key (Groq, Google AI Studio, or OpenRouter)

### Setup

```bash
git clone https://github.com/your-username/Job_Search.git
cd Job_Search

cp .env.example .env

# Backend
cd backend
python -m venv ../venv
source ../venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install

# Run both (from project root)
cd ..
make run-all
```

Or start each server individually:

```bash
# Backend (port 8000)
cd backend && uvicorn app.main:app --reload --port 8000

# Frontend (port 5173)
cd frontend && npx vite --port 5173
```

- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs


## Workflow

The app follows an 8-step pipeline:

1. **Settings** -- Enter API keys, select an LLM provider/model
2. **Job Description** -- Paste JD text; LLM extracts structured fields (title, company, skills, type)
3. **Resume** -- Upload one or more PDF resumes; LLM extracts structured content
4. **Score** -- ATS compatibility score with breakdown (required skills, preferred skills, title match, experience relevance, years fit, education)
5. **Tailor** -- AI rewrites each resume section to align with the JD
6. **Projects** -- Add/manage projects; system picks the best matches for the JD
7. **Email** -- Generate recruiter and hiring manager cold emails
8. **Download** -- Export tailored resume as DOCX; download ZIP bundle with emails


## Project Structure

```
Job_Search/
  backend/
    app/
      api/            # FastAPI route handlers (7 route groups)
      models/         # Pydantic request/response schemas
      services/       # Business logic (scoring, tailoring, emails, DOCX)
      prompts/        # LLM prompt templates (9 prompts)
      utils/          # Helpers (synonym map, dependencies, hashing)
      config.py       # Settings, model registry, prompt config
      main.py         # FastAPI entry point
    requirements.txt
  frontend/
    src/
      components/     # Layout, Stepper
      pages/          # 8 route pages
      services/       # Axios API client
      config/         # Step definitions
      types/          # TypeScript type definitions
      lib/            # Utility functions
  data/
    skill_synonyms.json   # Canonical skill -> alias mappings
    project_bank.yaml     # User project bank (runtime)
  .env.example
  Makefile
  idea.txt
```


## API Endpoints

| Method | Path                          | Purpose                        |
| ------ | ----------------------------- | ------------------------------ |
| POST   | /api/jd/parse-text            | Parse JD from raw text         |
| GET    | /api/jd/cache                 | List cached parsed JDs         |
| POST   | /api/resumes/upload           | Upload and parse a resume PDF  |
| GET    | /api/resumes/cache            | List cached parsed resumes     |
| GET    | /api/resumes/rank             | Score and rank resumes for a JD|
| POST   | /api/tailor/                  | Tailor a resume for a JD       |
| GET    | /api/tailor/cache             | List cached tailored resumes   |
| GET    | /api/projects/                | List project bank entries      |
| POST   | /api/projects/                | Add a project                  |
| POST   | /api/projects/select          | Auto-select best projects for JD|
| POST   | /api/emails/generate          | Generate cold emails           |
| GET    | /api/emails/cache             | List cached emails             |
| GET    | /api/download/{id}/docx       | Download tailored resume DOCX  |
| GET    | /api/download/{id}/zip        | Download ZIP (resume + emails) |
| GET    | /api/llm/providers            | List available LLM providers   |
| POST   | /api/llm/validate-key         | Validate an API key            |
| GET    | /api/health                   | Health check                   |


## License

MIT
