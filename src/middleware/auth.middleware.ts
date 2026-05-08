import type { MiddlewareFn } from 'telegraf';
import { supabase } from '../config/supabase.js';
import type { AppContext } from '../types/bot-context.js';
import type { AppUser } from '../types/session.js';
import { logger } from '../utils/logger.js';

const AUTH_CACHE_TTL_MS = 2 * 60 * 1000;
const userCache = new Map<number, { user: AppUser; expiresAt: number }>();

function isMissingUsersTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybeCode = (err as { code?: string }).code;
  return maybeCode === 'PGRST205';
}

async function getOrCreateUser(telegramId: number, ctxFrom: { username?: string; first_name?: string; last_name?: string }): Promise<AppUser> {
  const startedAt = Date.now();
  const { data: existing, error: fetchError } = await supabase
    .from('users')
    .select('id,telegram_id,telegram_username,telegram_first_name,telegram_last_name,status')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  logger.info({ telegramId, duration_ms: Date.now() - startedAt }, 'User lookup complete');

  if (fetchError) throw fetchError;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramId,
      telegram_username: ctxFrom.username ?? null,
      telegram_first_name: ctxFrom.first_name ?? null,
      telegram_last_name: ctxFrom.last_name ?? null,
      status: 'onboarding',
    })
    .select('id,telegram_id,telegram_username,telegram_first_name,telegram_last_name,status')
    .single();

  if (insertError) throw insertError;
  return created;
}

export const authMiddleware: MiddlewareFn<AppContext> = async (ctx, next) => {
  if (!ctx.from?.id) {
    await next();
    return;
  }
  const telegramId = ctx.from.id;

  const cached = userCache.get(telegramId);
  if (cached && cached.expiresAt > Date.now()) {
    ctx.state.user = cached.user;
    if (cached.user.status === 'banned') {
      logger.warn({ telegramId }, 'Dropped message from banned user (cache hit)');
      return;
    }
    await next();
    return;
  }

  let user: AppUser;
  try {
    user = await getOrCreateUser(telegramId, ctx.from);
  } catch (err) {
    if (!isMissingUsersTableError(err)) throw err;
    logger.warn({ err, telegramId }, 'users table missing; using in-memory auth fallback');
    user = {
      id: `temp-${telegramId}`,
      telegram_id: telegramId,
      telegram_username: ctx.from.username ?? null,
      telegram_first_name: ctx.from.first_name ?? null,
      telegram_last_name: ctx.from.last_name ?? null,
      status: 'onboarding',
    };
  }
  userCache.set(telegramId, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  ctx.state.user = user;

  if (user.status === 'banned') {
    logger.warn({ telegramId }, 'Dropped message from banned user');
    return;
  }

  await next();
};

