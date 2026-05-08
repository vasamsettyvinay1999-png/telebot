import type { MiddlewareFn } from 'telegraf';
import { supabase } from '../config/supabase.js';
import type { AppContext } from '../types/bot-context.js';
import type { AppUser } from '../types/session.js';
import { logger } from '../utils/logger.js';

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

  let user: AppUser;
  try {
    user = await getOrCreateUser(ctx.from.id, ctx.from);
  } catch (err) {
    if (!isMissingUsersTableError(err)) throw err;
    logger.warn({ err, telegramId: ctx.from.id }, 'users table missing; using in-memory auth fallback');
    user = {
      id: `temp-${ctx.from.id}`,
      telegram_id: ctx.from.id,
      telegram_username: ctx.from.username ?? null,
      telegram_first_name: ctx.from.first_name ?? null,
      telegram_last_name: ctx.from.last_name ?? null,
      status: 'onboarding',
    };
  }
  ctx.state.user = user;

  if (user.status === 'banned') {
    logger.warn({ telegramId: ctx.from.id }, 'Dropped message from banned user');
    return;
  }

  await next();
};

