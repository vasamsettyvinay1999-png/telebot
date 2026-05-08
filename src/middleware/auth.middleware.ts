import type { MiddlewareFn } from 'telegraf';
import { supabase } from '../config/supabase.js';
import type { AppContext } from '../types/bot-context.js';
import type { AppUser } from '../types/session.js';
import { logger } from '../utils/logger.js';

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

  const user = await getOrCreateUser(ctx.from.id, ctx.from);
  ctx.state.user = user;

  if (user.status === 'banned') {
    logger.warn({ telegramId: ctx.from.id }, 'Dropped message from banned user');
    return;
  }

  await next();
};

