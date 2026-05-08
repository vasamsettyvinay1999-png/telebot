import { describe, expect, it } from 'vitest';
import { EscalationDetector } from '../src/services/ai/escalation.detector.js';

describe('EscalationDetector', () => {
  const detector = new EscalationDetector();

  it('escalates on explicit human request', () => {
    const d = detector.detect('I need a real person now', 0);
    expect(d.shouldEscalate).toBe(true);
  });

  it('does not escalate normal market frustration', () => {
    const d = detector.detect('ugh this job market is rough', 0);
    expect(d.shouldEscalate).toBe(false);
  });
});

