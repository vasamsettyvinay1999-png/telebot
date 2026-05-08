import { describe, expect, it, vi } from 'vitest';

describe('resume optimize flow module', () => {
  it('loads optimize handler module', async () => {
    const mod = await import('../src/handlers/resume-generation.handler.js');
    expect(typeof mod.maybeHandleOptimizeFlow).toBe('function');
  });

  it('loads resume generator service module', async () => {
    const mod = await import('../src/services/resume/generator.service.js');
    expect(typeof mod.ResumeGeneratorService).toBe('function');
  });

  it('loads pdf converter module', async () => {
    const mod = await import('../src/services/resume/pdf.converter.js');
    expect(typeof mod.PdfConverter).toBe('function');
  });
});

