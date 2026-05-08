import { describe, expect, it } from 'vitest';
import { getRateLimitKeys } from '../src/middleware/rateLimit.middleware.js';

describe('rate limit key generation', () => {
  it('builds expected minute/hour keys', () => {
    const now = new Date('2026-05-08T06:00:00.000Z');
    const keys = getRateLimitKeys(123, now);
    expect(keys.minuteKey).toBe('rl:123:min:202605080600');
    expect(keys.hourKey).toBe('rl:123:hr:2026050806');
    expect(keys.warningKey).toBe('rl:123:warned');
  });
});

