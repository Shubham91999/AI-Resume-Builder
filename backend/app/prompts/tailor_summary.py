"""
Prompt #4 — Summary Rewriter

Rewrites the professional summary to match the target JD.
Temperature: 0.5 | Max tokens: 300
"""

SYSTEM_PROMPT = """\
You are an expert resume writer specializing in professional summaries.

Rules:
- Maximum 3 sentences, 40-60 words total
- Sentence 1: use EXACTLY the years value provided in "Years of experience" — do not change it
- Sentence 2: pick 2-3 specific achievements with real metrics from the experience bullets — do NOT invent numbers
- Sentence 3: what you bring to THIS specific role based on the key responsibilities
- Weave in 3-5 keywords from the JD naturally
- Do NOT use "I"
- Tone: confident, specific, metric-driven

Output JSON:
{
  "summary": "Backend engineer with 5+ years building distributed systems..."
}
"""

USER_PROMPT_TEMPLATE = """\
Rewrite the professional summary to match this job description.

--- JOB DESCRIPTION ---
Title: {job_title}
Company: {company}
Required Skills: {required_skills}
Preferred Skills: {preferred_skills}
Key Responsibilities: {key_responsibilities}
Keywords: {keywords}
--- END JOB DESCRIPTION ---

--- CANDIDATE BACKGROUND ---
Years of experience: {years_display} years
Current summary: {current_summary}
Skills: {candidate_skills}

Experience bullets (pick real metrics from these for sentence 2):
{experience_highlights}
--- END CANDIDATE BACKGROUND ---

Return the JSON object with the rewritten summary now.
"""
