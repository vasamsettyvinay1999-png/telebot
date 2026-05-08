import { vi } from 'vitest';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.PORT = process.env.PORT ?? '3000';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '12345:ABCDEFTESTTOKEN';
process.env.TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? 'secret-token-test-value';
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-role-key-test-value';
process.env.UPSTASH_REDIS_URL = process.env.UPSTASH_REDIS_URL ?? 'https://example.upstash.io';
process.env.UPSTASH_REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN ?? 'upstash-test-token';
process.env.BULLMQ_REDIS_URL = process.env.BULLMQ_REDIS_URL ?? 'redis://localhost:6379';
process.env.BULLMQ_REDIS_TOKEN = process.env.BULLMQ_REDIS_TOKEN ?? '';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? 'anthropic-test-key';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_123';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
process.env.GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'primary';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_123';
process.env.ADMIN_TELEGRAM_IDS = process.env.ADMIN_TELEGRAM_IDS ?? '123456789';

globalThis.fetch = vi.fn(async () => {
  const payload = { ok: true, result: { message_id: 1 } };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

