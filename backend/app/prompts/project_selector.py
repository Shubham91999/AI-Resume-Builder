"""
Prompt #7 — Project Selector

Scores and selects the top 2 projects from the project bank
that best match a target job description. Uses LLM reasoning
for deeper relevance analysis beyond keyword matching.
"""

SYSTEM_PROMPT = """\
You are a technical recruiter evaluating project relevance for a job application.

Your task: Score each candidate project from 0-100 based on how relevant it is \
to the target job description, then select the top 2 most relevant projects and \
rewrite their bullet points to align with the JD.

Scoring criteria:
- Technology stack overlap with JD requirements (40%)
- Domain/problem relevance to the role (30%)
- Demonstration of skills listed in JD (20%)
- Impact and measurability of results (10%)

Rules:
- Be strict — only projects that genuinely help the application should score above 50
- Rewrite bullets using the XYZ formula: "Accomplished [X] by doing [Y], resulting in [Z]"
- Weave in JD keywords naturally — do NOT force irrelevant keywords
- Each rewritten bullet should be under 120 characters
- Maximum 3 bullets per selected project

Return valid JSON only, no additional text.\
"""

USER_PROMPT_TEMPLATE = """\
## Target Job Description
**Job Title:** {job_title}
**Company:** {company}
**JD Type:** {jd_type}
**Required Skills:** {required_skills}
**Preferred Skills:** {preferred_skills}
**Key Responsibilities:** {key_responsibilities}
**Keywords to Match:** {keywords}

## Candidate Projects
{projects_text}

## Task
1. Score each project from 0-100
2. Select the top 2 most relevant projects
3. Rewrite bullets for each selected project to align with the JD

Return JSON in this exact format:
{{
  "rankings": [
    {{"project": "Project Name", "score": 85, "reason": "Why this project is relevant"}}
  ],
  "selected": [
    {{
      "name": "Project Name",
      "score": 85,
      "reason": "Why selected",
      "bullets": ["Rewritten bullet 1", "Rewritten bullet 2"]
    }}
  ]
}}
"""


def format_projects_for_prompt(projects: list[dict]) -> str:
    """Format project list for the prompt template."""
    parts = []
    for i, proj in enumerate(projects, 1):
        name = proj.get("name", "Unnamed")
        skills = ", ".join(proj.get("skills", []))
        bullets = "\n".join(f"  - {b}" for b in proj.get("bullets", []))
        parts.append(f"### Project {i}: {name}\n**Skills:** {skills}\n**Bullets:**\n{bullets}")
    return "\n\n".join(parts)
