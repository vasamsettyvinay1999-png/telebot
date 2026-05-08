import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSpy = vi.fn();
const eqSpy = vi.fn();

const supabaseMock = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: eqSpy,
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { telegram_id: 555 }, error: null })),
      })),
    })),
  })),
};

vi.mock('../src/config/supabase.js', () => ({ supabase: supabaseMock }));

describe('onboarding handler', () => {
  beforeEach(() => {
    updateSpy.mockReset();
    eqSpy.mockReset();
    eqSpy.mockResolvedValue({ error: null });
  });

  it('parses years of experience safely', async () => {
    const { parseYearsOfExperience } = await import('../src/handlers/onboarding.handler.js');
    expect(parseYearsOfExperience('5 years')).toBe(5);
    expect(parseYearsOfExperience('0')).toBe(0);
    expect(parseYearsOfExperience('99')).toBeNull();
    expect(parseYearsOfExperience('abc')).toBeNull();
  });

  it('parses comma separated target roles', async () => {
    const { parseTargetRoles } = await import('../src/handlers/onboarding.handler.js');
    expect(parseTargetRoles('Senior Engineer, Staff Engineer')).toEqual([
      'Senior Engineer',
      'Staff Engineer',
    ]);
  });

  it('starts onboarding for onboarding user', async () => {
    const { maybeStartOnboarding } = await import('../src/handlers/onboarding.handler.js');
    const reply = vi.fn(async () => ({}));
    const ctx = {
      state: { user: { id: 'u1', status: 'onboarding' } },
      session: { currentFlow: null, flowStep: 0, lastActivity: Date.now(), tempData: {} },
      reply,
    } as unknown as Parameters<typeof maybeStartOnboarding>[0];

    const started = await maybeStartOnboarding(ctx);
    expect(started).toBe(true);
    expect(ctx.session.currentFlow).toBe('onboarding');
    expect(ctx.session.flowStep).toBe(1);
    expect(reply).toHaveBeenCalled();
  });

  it('handles work auth callback and moves to location step', async () => {
    const { handleOnboardingCallback } = await import('../src/handlers/onboarding.handler.js');
    const reply = vi.fn(async () => ({}));
    const answerCbQuery = vi.fn(async () => ({}));
    const ctx = {
      from: { id: 777 },
      state: { user: { id: 'u1', status: 'onboarding' } },
      session: { currentFlow: 'onboarding', flowStep: 4, lastActivity: Date.now(), tempData: {} },
      callbackQuery: { data: 'onboard:auth:H1B' },
      answerCbQuery,
      reply,
    } as unknown as Parameters<typeof handleOnboardingCallback>[0];

    const handled = await handleOnboardingCallback(ctx);
    expect(handled).toBe(true);
    expect(ctx.session.flowStep).toBe(5);
    expect(answerCbQuery).toHaveBeenCalled();
    expect(reply).toHaveBeenCalled();
  });
});

