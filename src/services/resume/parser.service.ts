import fs from 'node:fs/promises';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { FileType } from '../../utils/fileValidator.js';
import { logger } from '../../utils/logger.js';

export interface ParsedResume {
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    github: string | null;
    location: string | null;
  };
  summary: string | null;
  experience: Array<{
    title: string;
    company: string;
    location: string | null;
    startDate: string;
    endDate: string | null;
    isCurrent: boolean;
    bullets: string[];
  }>;
  education: Array<{
    degree: string;
    field: string | null;
    institution: string;
    graduationYear: string | null;
    gpa: string | null;
  }>;
  skills: {
    technical: string[];
    tools: string[];
    certifications: string[];
    soft: string[];
  };
  totalYoE: number | null;
}

function stripControlChars(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export class ResumeParserService {
  public sanitizeText(rawText: string): string {
    const before = rawText;
    const withoutInjection = before.replace(
      /ignore previous instructions|system prompt|you are now/gi,
      '',
    );
    const stripped = stripControlChars(withoutInjection);
    const normalized = stripped.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (normalized.length !== before.length) {
      logger.warn('Sanitization modified uploaded resume content');
    }
    return normalized;
  }

  public async extractText(filePath: string, fileType: FileType): Promise<string> {
    if (fileType === 'txt') {
      const content = await fs.readFile(filePath, 'utf8');
      return content.replace(/^\uFEFF/, '');
    }

    const fileBuffer = await fs.readFile(filePath);
    if (fileType === 'pdf') {
      const parser = new PDFParse({ data: fileBuffer });
      const parsed = await parser.getText();
      await parser.destroy();
      const text = parsed.text.trim();
      if (text.length < 50) {
        // OCR fallback placeholder; wire tesseract worker in next increment.
        throw new Error('Image-based or unreadable PDF detected; OCR fallback required');
      }
      return text;
    }

    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  }

  public parseToStructured(rawText: string): ParsedResume {
    // Deterministic lightweight parser placeholder until Claude extraction is wired.
    const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] ?? null;
    const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
    const phone = rawText.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0] ?? null;
    const linkedin = rawText.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s]+/i)?.[0] ?? null;
    const github = rawText.match(/https?:\/\/(www\.)?github\.com\/[^\s]+/i)?.[0] ?? null;

    return {
      contact: {
        name: firstLine,
        email,
        phone,
        linkedin,
        github,
        location: null,
      },
      summary: null,
      experience: [],
      education: [],
      skills: {
        technical: [],
        tools: [],
        certifications: [],
        soft: [],
      },
      totalYoE: null,
    };
  }
}

