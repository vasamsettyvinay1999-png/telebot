import { supabase } from '../../config/supabase.js';
import { INTERVIEW_PREP_PROMPT } from '../../prompts/templates/interview-prep.prompt.js';
import { ClaudeClient } from '../ai/claude.client.js';
import { interviewPrepSchema } from '../resume/schemas.js';
import { extractJsonObject } from '../../utils/json.js';
import { logger } from '../../utils/logger.js';

export type InterviewPrep = ReturnType<typeof interviewPrepSchema.parse>;

export class InterviewPrepService {
  private readonly claude = new ClaudeClient();

  public async generate(userId: string, resumeText: string, jobDescription?: string): Promise<InterviewPrep> {
    const fallback = this.createFallback(resumeText, jobDescription);
    try {
      const payload = JSON.stringify({
        resume_text: resumeText,
        job_description: jobDescription ?? null,
      });
      const output = await this.claude.complete(INTERVIEW_PREP_PROMPT, payload, {
        maxTokens: 2600,
        userId,
        feature: 'interview_prep',
      });
      const jsonPayload = extractJsonObject(output);
      if (!jsonPayload) throw new Error('No JSON object found in interview prep output');
      const parsed = JSON.parse(jsonPayload) as unknown;
      return interviewPrepSchema.parse(parsed);
    } catch (error) {
      logger.warn({ err: error, userId }, 'Interview prep generation fell back to deterministic output');
      return fallback;
    }
  }

  public async save(userId: string, prep: InterviewPrep): Promise<void> {
    const { error } = await supabase.from('interview_preps').insert({
      user_id: userId,
      content: prep,
    });
    if (error) throw error;
  }

  private createFallback(resumeText: string, jobDescription?: string): InterviewPrep {
    const hasLeadership = /lead|mentor|manage/i.test(resumeText);
    const hasBackend = /node|typescript|api|backend|database|postgres|redis/i.test(
      `${resumeText}\n${jobDescription ?? ''}`,
    );
    return {
      focus_areas: [
        'Role-specific impact stories',
        'Quantified achievement framing',
        hasLeadership ? 'Leadership and cross-functional communication' : 'Collaboration and ownership',
      ],
      technical_questions: hasBackend
        ? [
            {
              question: 'How would you design a resilient backend service for high traffic?',
              what_good_answer_covers:
                'Rate limiting, queueing, observability, retries, and data consistency trade-offs.',
            },
          ]
        : [
            {
              question: 'How do you prioritize work when requirements are ambiguous?',
              what_good_answer_covers: 'Clarifying outcomes, risk-based sequencing, and stakeholder alignment.',
            },
          ],
      behavioral_questions: [
        {
          question: 'Tell me about a time you had a difficult stakeholder.',
          what_good_answer_covers: 'Empathy, alignment on outcomes, and measurable resolution.',
        },
      ],
      story_bank: [
        {
          title: 'High-impact delivery',
          situation: 'Project with tight deadlines and high visibility.',
          task: 'Ship with quality while reducing risk.',
          action: 'Broke scope into milestones, aligned stakeholders, and tracked metrics.',
          result: 'Delivered on time with measurable performance improvement.',
        },
      ],
      thirty_sixty_ninety_plan: [
        '30 days: learn domain, tools, and key stakeholders.',
        '60 days: own scoped deliverables and ship improvements.',
        '90 days: drive a high-impact initiative with measurable outcomes.',
      ],
      salary_negotiation_tips: [
        'Anchor discussion in market data and business impact.',
        'Negotiate total compensation, not just base salary.',
      ],
    };
  }
}

