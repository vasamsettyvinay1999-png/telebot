import { Telegraf } from 'telegraf';
import { env } from './config/env.js';
import type { AppContext } from './types/bot-context.js';

export const bot = new Telegraf<AppContext>(env.TELEGRAM_BOT_TOKEN, {
  handlerTimeout: 2_900,
});

