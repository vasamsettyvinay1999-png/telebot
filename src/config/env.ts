import { z } from 'zod';
import { EnvValidationError } from '../utils/errors.js';

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default('info'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Redis
  UPSTASH_REDIS_URL: z.string().min(1),
  UPSTASH_REDIS_TOKEN: z.string().min(1),
  BULLMQ_REDIS_URL: z.string().optional(),
  BULLMQ_REDIS_TOKEN: z.string().optional().default(''),

  // AI
  ANTHROPIC_API_KEY: z.string().min(1),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Google Calendar
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALENDAR_ID: z.string().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_CALENDAR_TIMEZONE: z.string().default('UTC'),

  // Email
  RESEND_API_KEY: z.string().min(1),

  // Admin
  ADMIN_TELEGRAM_IDS: z.string().min(1),
  ADMIN_ALERT_CHANNEL_ID: z.string().optional(),
});

function formatZodError(err: z.ZodError): string {
  const lines = err.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`);
  return lines.join('\n');
}

function loadEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = `Invalid environment variables:\n${formatZodError(parsed.error)}\n`;
    process.stderr.write(msg);
    throw new EnvValidationError('Invalid environment variables', parsed.error);
  }
  return parsed.data;
}

export const env = (() => {
  try {
    return loadEnv();
  } catch {
    process.exit(1);
  }
})();

