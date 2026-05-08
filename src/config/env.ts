import 'dotenv/config';
import { z } from 'zod';
import { EnvValidationError } from '../utils/errors.js';

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.preprocess(
    () => process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL,
    z.string().url().optional(),
  ),
  LOG_LEVEL: z.string().default('info'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
  TELEGRAM_USE_POLLING: z.preprocess(
    () => process.env.TELEGRAM_USE_POLLING ?? process.env.TELEGRAM_ENABLE_POLLING ?? 'false',
    z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  ),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Redis — @upstash/redis uses the HTTPS REST endpoint (Upstash dashboard: "REST API URL").
  UPSTASH_REDIS_URL: z.preprocess(
    () =>
      (process.env.UPSTASH_REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '').trim(),
    z.string().min(1),
  ),
  UPSTASH_REDIS_TOKEN: z.preprocess(
    () =>
      (process.env.UPSTASH_REDIS_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '').trim(),
    z.string().min(1),
  ),
  BULLMQ_REDIS_URL: z.string().optional(),
  BULLMQ_REDIS_TOKEN: z.string().optional().default(''),

  // AI
  ANTHROPIC_API_KEY: z.string().min(1),

  // Stripe
  STRIPE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Google Calendar
  GOOGLE_CALENDAR_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CALENDAR_ID: z.string().min(1).optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_CALENDAR_TIMEZONE: z.string().default('UTC'),

  // Email
  RESEND_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  RESEND_API_KEY: z.string().min(1).optional(),

  // Admin
  ADMIN_TELEGRAM_IDS: z.string().min(1),
  ADMIN_ALERT_CHANNEL_ID: z.string().optional(),
}).superRefine((value, ctx) => {
  try {
    const u = new URL(value.UPSTASH_REDIS_URL);
    if (u.protocol !== 'https:') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['UPSTASH_REDIS_URL'],
        message:
          'must be Upstash REST URL starting with https (not redis:// — use REST URL + token). Set UPSTASH_REDIS_REST_URL if that is how your provider labels it.',
      });
    }
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['UPSTASH_REDIS_URL'],
      message: 'must be a valid URL (Upstash REST API URL)',
    });
  }
  if (value.NODE_ENV === 'production' && value.TELEGRAM_USE_POLLING) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['TELEGRAM_USE_POLLING'],
      message: 'must be false in production (webhook-only mode)',
    });
  }
  if (value.NODE_ENV === 'production' && !value.APP_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['APP_URL'],
      message: 'required in production',
    });
  }
  if (value.STRIPE_ENABLED) {
    if (!value.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_SECRET_KEY'],
        message: 'required when STRIPE_ENABLED=true',
      });
    }
    if (!value.STRIPE_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STRIPE_WEBHOOK_SECRET'],
        message: 'required when STRIPE_ENABLED=true',
      });
    }
  }
  if (value.GOOGLE_CALENDAR_ENABLED) {
    if (!value.GOOGLE_CLIENT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_ID'],
        message: 'required when GOOGLE_CALENDAR_ENABLED=true',
      });
    }
    if (!value.GOOGLE_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'required when GOOGLE_CALENDAR_ENABLED=true',
      });
    }
    if (!value.GOOGLE_CALENDAR_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CALENDAR_ID'],
        message: 'required when GOOGLE_CALENDAR_ENABLED=true',
      });
    }
  }
  if (value.RESEND_ENABLED && !value.RESEND_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['RESEND_API_KEY'],
      message: 'required when RESEND_ENABLED=true',
    });
  }
});

function formatZodError(err: z.ZodError): string {
  const lines = err.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`);
  return lines.join('\n');
}

function loadEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // #region agent log
    fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'initial',hypothesisId:'H3',location:'src/config/env.ts:loadEnv:invalid',message:'Environment validation failed',data:{issueCount:parsed.error.issues.length,paths:parsed.error.issues.map((i)=>i.path.join('.')||'(root)')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const msg = `Invalid environment variables:\n${formatZodError(parsed.error)}\n`;
    process.stderr.write(msg);
    throw new EnvValidationError('Invalid environment variables', parsed.error);
  }
  // #region agent log
  fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'initial',hypothesisId:'H3',location:'src/config/env.ts:loadEnv:valid',message:'Environment validation passed',data:{nodeEnv:parsed.data.NODE_ENV,hasAppUrl:typeof process.env.APP_URL==='string'&&process.env.APP_URL.trim().length>0,hasTelegramToken:Boolean(parsed.data.TELEGRAM_BOT_TOKEN),hasAnthropicKey:Boolean(parsed.data.ANTHROPIC_API_KEY),adminIdsRawCount:parsed.data.ADMIN_TELEGRAM_IDS.split(',').map((s)=>s.trim()).filter(Boolean).length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return parsed.data;
}

export const env = (() => {
  try {
    return loadEnv();
  } catch {
    process.exit(1);
  }
})();

