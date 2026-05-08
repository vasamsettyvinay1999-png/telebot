import type { MiddlewareFn } from 'telegraf';
import { redis } from '../config/redis.js';
import type { AppContext } from '../types/bot-context.js';
import { chunkMessage } from '../utils/chunker.js';

const LIMITS = {
  perMinute: 10,
  perHour: 100,
};

export function getRateLimitKeys(userId: number, now = new Date()): {
  minuteKey: string;
  hourKey: string;
  warningKey: string;
} {
  const minuteBucket = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`;
  const hourBucket = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}`;
  return {
    minuteKey: `rl:${userId}:min:${minuteBucket}`,
    hourKey: `rl:${userId}:hr:${hourBucket}`,
    warningKey: `rl:${userId}:warned`,
  };
}

async function sendChunkedWarning(ctx: AppContext): Promise<void> {
  const warning = "You're sending messages too quickly. Please slow down.";
  const chunks = chunkMessage(warning);
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

export const rateLimitMiddleware: MiddlewareFn<AppContext> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await next();
    return;
  }

  const { minuteKey, hourKey, warningKey } = getRateLimitKeys(userId);
  const minCount = await redis.incr(minuteKey);
  if (minCount === 1) await redis.expire(minuteKey, 60);

  const hrCount = await redis.incr(hourKey);
  if (hrCount === 1) await redis.expire(hourKey, 3600);

  const limited = minCount > LIMITS.perMinute || hrCount > LIMITS.perHour;
  if (!limited) {
    await next();
    return;
  }

  const warned = await redis.set(warningKey, '1', { nx: true, ex: 15 });
  if (warned === 'OK') {
    await sendChunkedWarning(ctx);
    return;
  }
  await ctx.reply('Rate limit active. Please wait a few seconds and try again.');
};

