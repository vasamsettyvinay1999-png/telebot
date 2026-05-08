import type { AppContext } from '../types/bot-context.js';
import { EscalationDetector } from '../services/ai/escalation.detector.js';
import { bot } from '../bot.js';
import { env } from '../config/env.js';
import { EscalationService } from '../services/support/escalation.service.js';
import { MemoryService } from '../services/ai/memory.service.js';

const detector = new EscalationDetector();
const escalationService = new EscalationService();
const memoryService = new MemoryService();

function getConsecutiveErrors(ctx: AppContext): number {
  const value = ctx.session.tempData.consecutiveErrors;
  if (typeof value === 'number') return value;
  return 0;
}

function setConsecutiveErrors(ctx: AppContext, value: number): void {
  ctx.session.tempData.consecutiveErrors = value;
}

export async function maybeHandleEscalation(ctx: AppContext): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;
  const text = ctx.message.text;
  const userId = ctx.state.user?.id;
  const recentMessages = userId ? await memoryService.getRecentMessages(userId) : [];
  const priorUserMessages = recentMessages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .filter((m) => m !== text);
  const decision = detector.detectWithContext(text, getConsecutiveErrors(ctx), priorUserMessages);
  if (!decision.shouldEscalate) return false;

  ctx.session.currentFlow = 'escalation_pending';
  ctx.session.tempData.handoffRequired = true;
  if (ctx.state.user) {
    await escalationService.createCase({
      userId: ctx.state.user.id,
      reason: decision.reason ?? 'unspecified',
      urgency: decision.urgency,
      sourceMessage: text,
      triggerType: decision.reason ?? 'unspecified',
      similarityScore: decision.similarityScore ?? null,
    });
  }
  await ctx.reply(
    "I've flagged this for a member of our team to review. Someone will get back to you shortly. In the meantime, is there anything else I can help with?",
  );

  if (env.ADMIN_ALERT_CHANNEL_ID) {
    await bot.telegram.sendMessage(
      Number(env.ADMIN_ALERT_CHANNEL_ID),
      `⚠️ ESCALATION — ${decision.urgency}\nUser: ${ctx.from?.id}\nReason: ${decision.reason}\nMessage: ${text.slice(0, 200)}`,
    );
  }
  return true;
}

export function markOperationError(ctx: AppContext): void {
  setConsecutiveErrors(ctx, getConsecutiveErrors(ctx) + 1);
}

export function resetOperationErrors(ctx: AppContext): void {
  setConsecutiveErrors(ctx, 0);
}

