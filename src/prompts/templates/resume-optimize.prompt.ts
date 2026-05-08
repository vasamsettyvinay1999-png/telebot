export const RESUME_OPTIMIZE_PROMPT = `
Rewrite the resume for ATS/readability while preserving truth:
- Do not add new skills, titles, dates, employers, or metrics.
- Do not inflate seniority.
- Only rephrase and reorganize existing facts.
Return ONLY valid JSON matching this schema:
{
  "contact": { "name": string|null, "email": string|null, "phone": string|null, "linkedin": string|null, "github": string|null, "location": string|null },
  "summary": string|null,
  "experience": [{ "title": string, "company": string, "location": string|null, "startDate": string, "endDate": string|null, "isCurrent": boolean, "bullets": string[] }],
  "education": [{ "degree": string, "field": string|null, "institution": string, "graduationYear": string|null, "gpa": string|null }],
  "skills": { "technical": string[], "tools": string[], "certifications": string[], "soft": string[] },
  "totalYoE": number|null
}
No markdown. No explanation. JSON only.
`;

