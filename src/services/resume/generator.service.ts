import { randomUUID } from 'node:crypto';
import { supabase } from '../../config/supabase.js';
import { ClaudeClient } from '../ai/claude.client.js';
import { RESUME_OPTIMIZE_PROMPT } from '../../prompts/templates/resume-optimize.prompt.js';
import { DocxResumeBuilder } from './docx.builder.js';
import { validateResumeIntegrity } from './diff.validator.js';
import { PdfConverter } from './pdf.converter.js';
import type { ParsedResume } from './parser.service.js';
import { parsedResumeSchema } from './schemas.js';
import { extractJsonObject } from '../../utils/json.js';
import { logger } from '../../utils/logger.js';

export class ResumeGeneratorService {
  private readonly claude = new ClaudeClient();
  private readonly docxBuilder = new DocxResumeBuilder();
  private readonly pdfConverter = new PdfConverter();

  public async generateOptimizedResume(userId: string, resumeId: string): Promise<{ docxPath: string; pdfPath: string }> {
    const { data: resume, error } = await supabase
      .from('resumes')
      .select('id,parsed_sections')
      .eq('id', resumeId)
      .eq('user_id', userId)
      .single();
    if (error) throw error;
    const original = (resume.parsed_sections as ParsedResume) ?? null;
    if (!original) throw new Error('Resume structured data missing');

    const modelOutput = await this.claude.complete(RESUME_OPTIMIZE_PROMPT, JSON.stringify(original), {
      maxTokens: 2200,
      userId,
      feature: 'resume_optimization',
    });
    let generated = original;
    try {
      const jsonPayload = extractJsonObject(modelOutput);
      if (!jsonPayload) throw new Error('No JSON object found in Claude output');
      const parsed = JSON.parse(jsonPayload) as unknown;
      const validated = parsedResumeSchema.parse(parsed);
      generated = validated;
    } catch {
      logger.warn({ resumeId }, 'Claude resume output invalid JSON/schema, using original resume');
      generated = original;
    }

    const validation = validateResumeIntegrity(original, generated);
    if (!validation.isValid) {
      logger.warn({ resumeId, violations: validation.violations }, 'Resume integrity guard failed');
      generated = original;
    }

    const docxBuffer = await this.docxBuilder.build(generated);
    const pdfBuffer = await this.pdfConverter.convertDocxToPdf(docxBuffer);
    const docId = randomUUID();
    const docxPath = `generated/${userId}/${docId}.docx`;
    const pdfPath = `generated/${userId}/${docId}.pdf`;
    await supabase.storage.from('resumes').upload(docxPath, docxBuffer, { upsert: true });
    await supabase.storage.from('resumes').upload(pdfPath, pdfBuffer, { upsert: true });
    return { docxPath, pdfPath };
  }
}

