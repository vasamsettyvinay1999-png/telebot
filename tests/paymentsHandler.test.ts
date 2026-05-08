import { beforeEach, describe, expect, it, vi } from 'vitest';

const createCheckoutSessionMock = vi.fn(async () => 'https://checkout.stripe.test/session_123');
const getUserByTelegramIdMock = vi.fn(async () => ({
  id: 'u1',
  telegram_id: 999,
  telegram_username: 'demo',
  full_name: 'Demo',
  status: 'approved',
  daily_generation_count: 2,
  extra_credits: 3,
}));

vi.mock('../src/services/payments/stripe.service.js', () => ({
  StripeService: class {
    public createCheckoutSession = createCheckoutSessionMock;
  },
}));

vi.mock('../src/services/user/user.service.js', () => ({
  UserService: class {
    public getUserByTelegramId = getUserByTelegramIdMock;
  },
}));

describe('payments handler registration', () => {
  beforeEach(() => {
    createCheckoutSessionMock.mockClear();
    getUserByTelegramIdMock.mockClear();
  });

  it('registers without throwing', async () => {
    const { registerPaymentHandlers } = await import('../src/handlers/payments.handler.js');
    expect(() => registerPaymentHandlers()).not.toThrow();
  });
});

