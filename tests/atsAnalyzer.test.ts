import { describe, expect, it } from 'vitest';
import { ATSAnalyzer } from '../src/services/resume/ats.analyzer.js';

describe('ATSAnalyzer', () => {
  const analyzer = new ATSAnalyzer();

  it('produces high score for strong resume text', () => {
    const resume = `
Professional Summary
Email: test@example.com
Experience
• Built ETL pipelines for analytics with SQL and Python
• Reduced processing time by 30%
Jan 2021 - Mar 2024
`;
    const report = analyzer.analyzeResume(resume, 'Need SQL Python ETL analytics experience');
    expect(report.ats_score).toBeGreaterThan(60);
  });

  it('produces lower score for weak resume text', () => {
    const resume = `hello world`;
    const report = analyzer.analyzeResume(resume);
    expect(report.ats_score).toBeLessThan(70);
  });
});

