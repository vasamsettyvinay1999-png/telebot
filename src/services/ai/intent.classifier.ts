export type IntentType =
  | 'resume_upload'
  | 'resume_question'
  | 'resume_optimize'
  | 'resume_generate'
  | 'job_fit_analysis'
  | 'ats_analysis'
  | 'interview_prep'
  | 'cover_letter'
  | 'career_question'
  | 'lead_inquiry'
  | 'escalation'
  | 'small_talk'
  | 'unknown';

const keywordMap: Array<{ intent: IntentType; patterns: RegExp[] }> = [
  { intent: 'ats_analysis', patterns: [/ats/i, /analy[sz]e/i] },
  { intent: 'resume_optimize', patterns: [/optimi[sz]e/i, /tailor/i] },
  { intent: 'interview_prep', patterns: [/interview/i, /mock/i] },
  { intent: 'cover_letter', patterns: [/cover letter/i] },
  { intent: 'lead_inquiry', patterns: [/pricing/i, /services/i, /our company/i] },
  { intent: 'small_talk', patterns: [/hello/i, /hi/i, /thanks/i] },
];

export class IntentClassifier {
  public classify(message: string): IntentType {
    for (const entry of keywordMap) {
      if (entry.patterns.some((pattern) => pattern.test(message))) return entry.intent;
    }
    if (message.trim().length > 0) return 'career_question';
    return 'unknown';
  }
}

