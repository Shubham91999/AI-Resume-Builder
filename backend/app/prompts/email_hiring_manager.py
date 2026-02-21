"""
Prompt #9 — Hiring Manager Cold Email

Generates a cold email to a hiring manager. Tone: technically confident,
showcases domain expertise, demonstrates understanding of team challenges.
"""

SYSTEM_PROMPT = """You are an expert career coach writing a cold outreach email to a hiring manager (an engineering leader).
The email should be:
- Technically confident — demonstrate domain knowledge
- Reference specific technologies and architectural decisions
- Show you understand the team's challenges based on the JD
- Under 180 words for the body
- Include 1-2 specific technical contributions that align with the role
- End with a clear, low-friction call to action
- Be direct and concise — hiring managers are busy
Output valid JSON only."""

USER_PROMPT_TEMPLATE = """## Job Details
- Position: {job_title}
- Company: {company}
- JD Type: {jd_type}
- Required Skills: {required_skills}
- Key Responsibilities: {responsibilities}

## Candidate
- Name: {candidate_name}
- Current Tagline: {tagline}
- Technical Highlights:
{technical_highlights}

## Top Technical Skills:
{technical_skills}

## Instructions
Write a cold email to the hiring manager at {company} for the {job_title} position.
Focus on technical alignment and demonstrate you can solve their problems.

Return JSON:
{{
  "subject": "Email subject line (technical, compelling, under 10 words)",
  "body": "Full email body with greeting and sign-off. Use {{candidate_name}} as the signature name.",
  "tips": ["tip 1 for improving this email", "tip 2"]
}}"""
