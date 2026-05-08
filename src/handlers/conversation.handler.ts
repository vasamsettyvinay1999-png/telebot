import type { MiddlewareFn } from 'telegraf';
import type { Update } from 'telegraf/types';
import { bot } from '../bot.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware.js';
import { sessionMiddleware } from '../middleware/session.middleware.js';
import {
  handleAdminApprovalCallback,
  handleOnboardingCallback,
  handleOnboardingFlow,
  maybeStartOnboarding,
} from './onboarding.handler.js';
import { registerAdminHandlers } from './admin.handler.js';
import { registerPaymentHandlers } from './payments.handler.js';
import { maybeHandleATSFlow } from './ats.handler.js';
import { maybeHandleOptimizeFlow } from './resume-generation.handler.js';
import { maybeHandleInterviewPrepFlow } from './interview-prep.handler.js';
import { maybeHandleCoverLetterFlow } from './cover-letter.handler.js';
import { maybeHandleHistoryCommands } from './history.handler.js';
import { maybeHandleEscalation, resetOperationErrors } from './escalation.handler.js';
import { MemoryService } from '../services/ai/memory.service.js';
import { maybeHandleApplicationCommands } from './application.handler.js';
import { maybeHandleReferralCommands } from './referral.handler.js';
import {
  maybeHandleLeadCallback,
  maybeHandleLeadEmailStep,
  maybeHandleLeadFlow,
} from './lead.handler.js';
import type { AppContext } from '../types/bot-context.js';
import { chunkMessage } from '../utils/chunker.js';
import { logger } from '../utils/logger.js';

const perUserQueue = new Map<number, Promise<void>>();
const memoryService = new MemoryService();

async function replyChunked(ctx: AppContext, text: string): Promise<void> {
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    await ctx.reply(chunk);
    if (ctx.state.user) {
      await memoryService.addMessage(ctx.state.user.id, {
        role: 'assistant',
        content: chunk,
        timestamp: Date.now(),
      });
    }
  }
}

const routingMiddleware: MiddlewareFn<AppContext> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await next();
    return;
  }

  const run = async (): Promise<void> => {
    if (ctx.state.user && ctx.message && 'text' in ctx.message) {
      await memoryService.addMessage(ctx.state.user.id, {
        role: 'user',
        content: ctx.message.text,
        timestamp: Date.now(),
      });
    }

    if (await maybeStartOnboarding(ctx)) return;

    if (ctx.callbackQuery) {
      if (await handleAdminApprovalCallback(ctx)) return;
      if (await handleOnboardingCallback(ctx)) return;
      if (await maybeHandleLeadCallback(ctx)) return;
    }

    if (await handleOnboardingFlow(ctx)) return;
    if (await maybeHandleLeadEmailStep(ctx)) return;
    if (await maybeHandleLeadFlow(ctx)) return;
    if (await maybeHandleEscalation(ctx)) return;
    if (await maybeHandleApplicationCommands(ctx)) return;
    if (await maybeHandleReferralCommands(ctx)) return;
    if (await maybeHandleATSFlow(ctx)) return;
    if (await maybeHandleOptimizeFlow(ctx)) return;
    if (await maybeHandleInterviewPrepFlow(ctx)) return;
    if (await maybeHandleCoverLetterFlow(ctx)) return;
    if (await maybeHandleHistoryCommands(ctx)) return;

    if (ctx.session.currentFlow) {
      await replyChunked(
        ctx,
        `You're currently in flow "${ctx.session.currentFlow}" (step ${ctx.session.flowStep}).`,
      );
      return;
    }

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await replyChunked(ctx, 'Callback received.');
      return;
    }

    if (ctx.message && 'document' in ctx.message) {
      await replyChunked(ctx, 'File received. Processing queue will handle this shortly.');
      return;
    }

    if (ctx.message && 'photo' in ctx.message) {
      await replyChunked(ctx, 'Photo received. Please upload PDF or DOCX for resume parsing.');
      return;
    }

    if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
      const command = ctx.message.text.split(/\s+/)[0]?.slice(1) ?? 'unknown';
      await replyChunked(ctx, `Command "${command}" received.`);
      return;
    }

    if (ctx.message && 'text' in ctx.message) {
      resetOperationErrors(ctx);
      await replyChunked(ctx, `Received: ${ctx.message.text}`);
      return;
    }

    await replyChunked(ctx, 'Unsupported update type received.');
  };

  const previous = perUserQueue.get(userId) ?? Promise.resolve();
  const current = previous.then(run).catch((err) => {
    logger.error({ err, userId }, 'Queued message processing failed');
  });
  perUserQueue.set(userId, current.finally(() => perUserQueue.delete(userId)));
  await current;
};

export function registerConversationHandlers(): void {
  registerAdminHandlers();
  registerPaymentHandlers();
  bot.command('start', async (ctx) => {
    await replyChunked(
      ctx,
      "Bot is online. If setup tables are still pending, core onboarding may be limited until migrations finish.",
    );
  });
  bot.use(authMiddleware);
  bot.use(rateLimitMiddleware);
  bot.use(sessionMiddleware);
  bot.use(routingMiddleware);

  bot.on('edited_message', async (ctx) => {
    const messageId = ctx.editedMessage?.message_id;
    logger.info({ userId: ctx.from?.id, messageId }, 'Edited message treated as new intent');
    if (ctx.editedMessage && 'text' in ctx.editedMessage) {
      await replyChunked(ctx, `Edited message received: ${ctx.editedMessage.text}`);
    }
  });

  bot.on('channel_post', async () => {
    // Ignore channel posts for now.
  });

  bot.catch(async (err, ctx) => {
    logger.error({ err, update: ctx.update }, 'Telegraf update handling failed');
    try {
      await ctx.reply('Temporary issue handling your message. Please try again in a few seconds.');
    } catch (replyErr) {
      logger.error({ err: replyErr }, 'Failed to send fallback error reply');
    }
  });
}

export function extractUpdateId(update: Update): number | null {
  return typeof update.update_id === 'number' ? update.update_id : null;
}

