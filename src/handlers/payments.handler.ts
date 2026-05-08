import { Markup } from 'telegraf';
import { bot } from '../bot.js';
import { DAILY_FREE_GENERATIONS } from '../config/constants.js';
import { StripeService } from '../services/payments/stripe.service.js';
import { UserService } from '../services/user/user.service.js';
import type { AppContext } from '../types/bot-context.js';
import { logger } from '../utils/logger.js';

const stripeService = new StripeService();
const userService = new UserService();

function buyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Buy 1 Credit - $2', 'buy:single')],
    [Markup.button.callback('Buy 5 Credits - $8 ⭐', 'buy:bundle')],
  ]);
}

function formatBalanceLine(dailyUsed: number, extraCredits: number): string {
  const dailyLeft = Math.max(0, DAILY_FREE_GENERATIONS - dailyUsed);
  return `Credits remaining today: ${dailyLeft}/${DAILY_FREE_GENERATIONS} free | ${extraCredits} extra`;
}

export function registerPaymentHandlers(): void {
  bot.command('buy', async (ctx) => {
    const telegramId = ctx.from?.id;
    let balanceText = 'Credits remaining today: -/5 free | - extra';
    if (telegramId) {
      const user = await userService.getUserByTelegramId(telegramId);
      if (user) {
        balanceText = formatBalanceLine(user.daily_generation_count, user.extra_credits);
      }
    }

    await ctx.reply(
      `💳 *Buy Premium Credits*\n\n${balanceText}\n\nNeed more generations? Here's what's available:\n\n1️⃣ *1 Credit* — $2.00\n2️⃣ *5 Credits* — $8.00 _(save $2)_\n\nEach credit = 1 premium generation:\n• Resume optimization\n• Full ATS analysis\n• Cover letter\n• Interview prep package`,
      {
        ...buyKeyboard(),
        parse_mode: 'Markdown',
      },
    );
  });

  bot.command('start', async (ctx) => {
    if (!('message' in ctx) || !('text' in ctx.message)) return;
    const text = ctx.message.text;
    if (!text.includes('credits_success') && !text.includes('credits_cancel')) return;
    if (text.includes('credits_success')) {
      await ctx.reply('✅ Payment flow completed. Use /balance to refresh your credits.');
      return;
    }
    await ctx.reply('Payment canceled. You can run /buy anytime to try again.');
  });

  bot.action('buy:refresh', async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await userService.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.answerCbQuery('Account not found');
      return;
    }
    await ctx.answerCbQuery('Balance refreshed');
    await ctx.reply(formatBalanceLine(user.daily_generation_count, user.extra_credits));
  });

  bot.action(/^buy:(single|bundle)$/, async (ctx) => {
    const typedCtx = ctx as AppContext & { match: RegExpMatchArray };
    const userId = typedCtx.state.user?.id;
    if (!userId) {
      await typedCtx.answerCbQuery('User not available');
      return;
    }
    const pkg =
      typedCtx.match[1] === 'bundle' || typedCtx.match[1] === 'single'
        ? typedCtx.match[1]
        : 'single';
    try {
      const checkoutUrl = await stripeService.createCheckoutSession(userId, pkg);
      await typedCtx.answerCbQuery('Checkout link generated');
      await typedCtx.reply(
        `Click here to complete your purchase securely:\n${checkoutUrl}\n\nThe link expires in 30 minutes.\n\nAfter payment, run /balance or tap refresh.`,
        Markup.inlineKeyboard([Markup.button.callback('Refresh Balance', 'buy:refresh')]),
      );
    } catch (error) {
      logger.error({ err: error, userId, pkg }, 'Failed to generate Stripe checkout session');
      await typedCtx.answerCbQuery('Failed to start checkout');
      await typedCtx.reply('Could not generate checkout link. Please try /buy again.');
    }
  });

  bot.command('balance', async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;
    const user = await userService.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Could not locate your account yet.');
      return;
    }
    await ctx.reply(formatBalanceLine(user.daily_generation_count, user.extra_credits));
  });
}

