import { supabase } from '../../config/supabase.js';
import { COVER_LETTER_PROMPT } from '../../prompts/templates/cover-letter.prompt.js';
import { ClaudeClient } from '../ai/claude.client.js';
import { coverLetterSchema } from '../resume/schemas.js';
import { extractJsonObject } from '../../utils/json.js';
import { logger } from '../../utils/logger.js';

export type CoverLetter = ReturnType<typeof coverLetterSchema.parse>;

export class CoverLetterService {
  private readonly claude = new ClaudeClient();

  public async generate(userId: string, resumeText: string, jobDescription?: string): Promise<CoverLetter> {
    const fallback = this.createFallback();
    try {
      const payload = JSON.stringify({
        resume_text: resumeText,
        job_description: jobDescription ?? null,
      });
      const output = await this.claude.complete(COVER_LETTER_PROMPT, payload, {
        maxTokens: 1600,
        userId,
        feature: 'cover_letter',
      });
      const jsonPayload = extractJsonObject(output);
      if (!jsonPayload) throw new Error('No JSON object found in cover letter output');
      const parsed = JSON.parse(jsonPayload) as unknown;
      return coverLetterSchema.parse(parsed);
    } catch (error) {
      logger.warn({ err: error, userId }, 'Cover letter generation fell back to deterministic output');
      return fallback;
    }
  }

  public async save(userId: string, coverLetter: CoverLetter): Promise<void> {
    const { error } = await supabase.from('cover_letters').insert({
      user_id: userId,
      content: coverLetter,
    });
    if (error) throw error;
  }

  private createFallback(): CoverLetter {
    return {
      subject: 'Application for the role',
      greeting: 'Dear Hiring Team,',
      opening:
        'I am excited to apply for this role and bring a track record of delivering measurable outcomes.',
      body_paragraphs: [
        'Across recent projects, I have focused on solving business problems with pragmatic technical execution and clear stakeholder communication.',
        'I am especially motivated by opportunities where I can contribute quickly, collaborate cross-functionally, and continuously improve systems and processes.',
      ],
      closing:
        'Thank you for your time and consideration. I would welcome the opportunity to discuss how I can contribute.',
      signature: 'Sincerely,\nCandidate',
    };
  }
}

