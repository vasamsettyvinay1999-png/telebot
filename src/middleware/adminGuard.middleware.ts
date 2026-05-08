import type { MiddlewareFn } from 'telegraf';
import { ADMIN_TELEGRAM_IDS } from '../config/constants.js';
import type { AppContext } from '../types/bot-context.js';
import { logger } from '../utils/logger.js';

export const adminGuardMiddleware: MiddlewareFn<AppContext> = async (ctx, next) => {
  const senderId = ctx.from?.id;
  const isAdmin = typeof senderId === 'number' && ADMIN_TELEGRAM_IDS.includes(BigInt(senderId));

  logger.info(
    {
      telegramId: senderId,
      isAdmin,
      updateType: ctx.updateType,
    },
    'Admin guard check',
  );

  if (!isAdmin) {
    await ctx.reply('⛔ Unauthorized');
    return;
  }

  await next();
};

