import { ATS_ANALYSIS_PROMPT } from '../../prompts/templates/ats-analysis.prompt.js';
import { ClaudeClient } from '../ai/claude.client.js';
import { atsReportSchema } from './schemas.js';
import { extractJsonObject } from '../../utils/json.js';
import { logger } from '../../utils/logger.js';

export interface ATSPreScanResult {
  score: number;
  topIssues: string[];
}

export interface ATSReport {
  ats_score: number;
  fit_score: number | null;
  formatting: {
    score: number;
    critical_issues: Array<{
      type: string;
      description: string;
      how_to_fix: string;
      severity: 'critical' | 'warning' | 'info';
    }>;
  };
  keywords: {
    resume_keywords: string[];
    jd_keywords: string[] | null;
    matched: string[];
    missing_critical: string[];
    missing_nice_to_have: string[];
    overused: string[];
    keyword_density: number;
  };
  content_quality: {
    has_professional_summary: boolean;
    bullet_strength_score: number;
    quantification_rate: number;
    weak_phrases_found: string[];
    date_consistency: boolean;
    contact_info_complete: boolean;
  };
  recommendations: Array<{
    priority: 1 | 2 | 3;
    category: string;
    action: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  verdict: string;
  is_application_ready: boolean;
}

export class ATSAnalyzer {
  private readonly claude = new ClaudeClient();

  public quickPreScan(resumeText: string): ATSPreScanResult {
    let score = 100;
    const issues: string[] = [];

    if (resumeText.length < 500) {
      score -= 25;
      issues.push('Resume appears too short; add more role detail and achievements.');
    }
    if (!/experience/i.test(resumeText)) {
      score -= 20;
      issues.push('Missing clear "Experience" section header.');
    }
    if (!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(resumeText)) {
      score -= 20;
      issues.push('No email address detected in resume body.');
    }
    if (!/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})/i.test(resumeText)) {
      score -= 15;
      issues.push('No clear date patterns found for role timelines.');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      topIssues: issues.slice(0, 3),
    };
  }

  public extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s+#.-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    const stop = new Set(['with', 'from', 'that', 'this', 'have', 'were', 'your', 'role', 'team']);
    return [...new Set(words.filter((w) => !stop.has(w)))].slice(0, 300);
  }

  public calculateMatchScore(resumeKeywords: string[], jdKeywords: string[]): number {
    if (jdKeywords.length === 0) return 0;
    const resumeSet = new Set(resumeKeywords);
    const matched = jdKeywords.filter((k) => resumeSet.has(k)).length;
    return Math.round((matched / jdKeywords.length) * 100);
  }

  public analyzeResume(resumeText: string, jdText?: string): ATSReport {
    const pre = this.quickPreScan(resumeText);
    const resumeKeywords = this.extractKeywords(resumeText);
    const jdKeywords = jdText ? this.extractKeywords(jdText) : null;
    const matched = jdKeywords ? jdKeywords.filter((k) => resumeKeywords.includes(k)) : [];
    const missing = jdKeywords ? jdKeywords.filter((k) => !resumeKeywords.includes(k)) : [];

    const weakPhrases = ['responsible for', 'helped with', 'worked on', 'assisted with'].filter((p) =>
      resumeText.toLowerCase().includes(p),
    );
    const bullets = resumeText.split('\n').filter((l) => /^[•\-*]/.test(l.trim()));
    const bulletsWithNums = bullets.filter((b) => /\d/.test(b)).length;
    const quantRate = bullets.length === 0 ? 0 : bulletsWithNums / bullets.length;
    const fit = jdKeywords ? this.calculateMatchScore(resumeKeywords, jdKeywords) : null;

    const report: ATSReport = {
      ats_score: pre.score,
      fit_score: fit,
      formatting: {
        score: pre.score,
        critical_issues: pre.topIssues.map((issue) => ({
          type: 'format_or_content',
          description: issue,
          how_to_fix: 'Revise section structure and include explicit ATS-friendly labels.',
          severity: 'warning',
        })),
      },
      keywords: {
        resume_keywords: resumeKeywords.slice(0, 80),
        jd_keywords: jdKeywords ? jdKeywords.slice(0, 80) : null,
        matched: matched.slice(0, 30),
        missing_critical: missing.slice(0, 15),
        missing_nice_to_have: missing.slice(15, 30),
        overused: [],
        keyword_density: jdKeywords ? this.calculateMatchScore(resumeKeywords, jdKeywords) : 0,
      },
      content_quality: {
        has_professional_summary: /summary|professional summary/i.test(resumeText),
        bullet_strength_score: Math.max(0, 100 - weakPhrases.length * 12),
        quantification_rate: Number((quantRate * 100).toFixed(1)),
        weak_phrases_found: weakPhrases,
        date_consistency: /(20\d{2})/.test(resumeText),
        contact_info_complete: /@/.test(resumeText) && /\d/.test(resumeText),
      },
      recommendations: [
        {
          priority: 1,
          category: 'keywords',
          action: 'Add missing high-priority JD keywords only where accurate.',
          impact: 'high',
        },
        {
          priority: 2,
          category: 'bullets',
          action: 'Strengthen weak bullet openers and lead with outcomes.',
          impact: 'medium',
        },
        {
          priority: 3,
          category: 'metrics',
          action: 'Increase quantified bullets where real numbers are available.',
          impact: 'medium',
        },
      ],
      verdict:
        pre.score >= 75
          ? 'Strong ATS baseline. Focus on role-specific keyword alignment.'
          : 'ATS compatibility needs improvements before high-volume applications.',
      is_application_ready: pre.score >= 70 && (fit === null || fit >= 60),
    };

    return report;
  }

  public async analyzeResumeWithClaude(resumeText: string, jdText?: string): Promise<ATSReport> {
    try {
      const payload = JSON.stringify({
        resume_text: resumeText,
        job_description: jdText ?? null,
      });
      const modelOutput = await this.claude.complete(ATS_ANALYSIS_PROMPT, payload, {
        maxTokens: 2400,
        feature: 'ats_analysis',
      });
      const jsonPayload = extractJsonObject(modelOutput);
      if (!jsonPayload) throw new Error('No JSON object found in ATS model output');
      const parsed = JSON.parse(jsonPayload) as unknown;
      const validated = atsReportSchema.parse(parsed);
      return validated;
    } catch (error) {
      logger.warn({ err: error }, 'Claude ATS output invalid, using deterministic analyzer fallback');
      return this.analyzeResume(resumeText, jdText);
    }
  }
}

