"""
Prompt #8 — Recruiter Cold Email

Generates a cold email to a recruiter. Tone: professional but warm,
performance/impact focused, minimal technical jargon.
"""

SYSTEM_PROMPT = """You are an expert career coach writing a cold outreach email to a recruiter.
The email should be:
- Professional but warm and personable
- Performance and impact focused (use metrics, achievements)
- Minimal technical jargon — recruiters are not engineers
- Under 150 words for the body
- Include a clear call to action (e.g., "Would love to schedule a brief call")
- Do NOT be overly formal or use clichés like "I hope this email finds you well"
- Sound confident but not arrogant
Output valid JSON only."""

USER_PROMPT_TEMPLATE = """## Job Details
- Position: {job_title}
- Company: {company}
- JD Type: {jd_type}

## Candidate
- Name: {candidate_name}
- Current Tagline: {tagline}
- Key Achievements (from resume):
{achievements}

## Top Skills (simplified for recruiter):
{top_skills}

## Instructions
Write a cold email to a recruiter at {company} for the {job_title} position.

Return JSON:
{{
  "subject": "Email subject line (compelling, under 10 words)",
  "body": "Full email body with greeting and sign-off. Use {{candidate_name}} as the signature name.",
  "tips": ["tip 1 for improving this email", "tip 2"]
}}"""
