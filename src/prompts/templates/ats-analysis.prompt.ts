export const ATS_ANALYSIS_PROMPT = `
You are an ATS expert. Analyze a resume and optional JD.
Return ONLY valid JSON and nothing else, with this exact structure:
{
  "ats_score": number(0-100),
  "fit_score": number(0-100) | null,
  "formatting": {
    "score": number(0-100),
    "critical_issues": [{ "type": string, "description": string, "how_to_fix": string, "severity": "critical"|"warning"|"info" }]
  },
  "keywords": {
    "resume_keywords": string[],
    "jd_keywords": string[] | null,
    "matched": string[],
    "missing_critical": string[],
    "missing_nice_to_have": string[],
    "overused": string[],
    "keyword_density": number(0-100)
  },
  "content_quality": {
    "has_professional_summary": boolean,
    "bullet_strength_score": number(0-100),
    "quantification_rate": number(0-100),
    "weak_phrases_found": string[],
    "date_consistency": boolean,
    "contact_info_complete": boolean
  },
  "recommendations": [{ "priority": 1|2|3, "category": string, "action": string, "impact": "high"|"medium"|"low" }],
  "verdict": string,
  "is_application_ready": boolean
}
No markdown. No prose outside JSON.
`;

