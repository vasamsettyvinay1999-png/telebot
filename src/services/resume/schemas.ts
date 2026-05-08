import { z } from 'zod';

export const parsedResumeSchema = z.object({
  contact: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    linkedin: z.string().nullable(),
    github: z.string().nullable(),
    location: z.string().nullable(),
  }),
  summary: z.string().nullable(),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string().nullable(),
      startDate: z.string(),
      endDate: z.string().nullable(),
      isCurrent: z.boolean(),
      bullets: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      field: z.string().nullable(),
      institution: z.string(),
      graduationYear: z.string().nullable(),
      gpa: z.string().nullable(),
    }),
  ),
  skills: z.object({
    technical: z.array(z.string()),
    tools: z.array(z.string()),
    certifications: z.array(z.string()),
    soft: z.array(z.string()),
  }),
  totalYoE: z.number().nullable(),
});

export const atsReportSchema = z.object({
  ats_score: z.number().min(0).max(100),
  fit_score: z.number().min(0).max(100).nullable(),
  formatting: z.object({
    score: z.number().min(0).max(100),
    critical_issues: z.array(
      z.object({
        type: z.string(),
        description: z.string(),
        how_to_fix: z.string(),
        severity: z.enum(['critical', 'warning', 'info']),
      }),
    ),
  }),
  keywords: z.object({
    resume_keywords: z.array(z.string()),
    jd_keywords: z.array(z.string()).nullable(),
    matched: z.array(z.string()),
    missing_critical: z.array(z.string()),
    missing_nice_to_have: z.array(z.string()),
    overused: z.array(z.string()),
    keyword_density: z.number().min(0).max(100),
  }),
  content_quality: z.object({
    has_professional_summary: z.boolean(),
    bullet_strength_score: z.number().min(0).max(100),
    quantification_rate: z.number().min(0).max(100),
    weak_phrases_found: z.array(z.string()),
    date_consistency: z.boolean(),
    contact_info_complete: z.boolean(),
  }),
  recommendations: z.array(
    z.object({
      priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      category: z.string(),
      action: z.string(),
      impact: z.enum(['high', 'medium', 'low']),
    }),
  ),
  verdict: z.string(),
  is_application_ready: z.boolean(),
});

export type ParsedResumeSchema = z.infer<typeof parsedResumeSchema>;
export type ATSReportSchema = z.infer<typeof atsReportSchema>;

export const interviewPrepSchema = z.object({
  focus_areas: z.array(z.string()),
  technical_questions: z.array(
    z.object({ question: z.string(), what_good_answer_covers: z.string() }),
  ),
  behavioral_questions: z.array(
    z.object({ question: z.string(), what_good_answer_covers: z.string() }),
  ),
  story_bank: z.array(
    z.object({
      title: z.string(),
      situation: z.string(),
      task: z.string(),
      action: z.string(),
      result: z.string(),
    }),
  ),
  thirty_sixty_ninety_plan: z.array(z.string()),
  salary_negotiation_tips: z.array(z.string()),
});

export const coverLetterSchema = z.object({
  subject: z.string(),
  greeting: z.string(),
  opening: z.string(),
  body_paragraphs: z.array(z.string()),
  closing: z.string(),
  signature: z.string(),
});

