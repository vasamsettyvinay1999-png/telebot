import type { AppContext } from '../types/bot-context.js';
import { ReferralService } from '../services/referral/referral.service.js';

const referralService = new ReferralService();

export async function maybeHandleReferralCommands(ctx: AppContext): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;
  if (!ctx.state.user) return false;
  const text = ctx.message.text.trim();

  if (text === '/referral') {
    const code = await referralService.getReferralCode(ctx.state.user.id);
    await ctx.reply(code ? `Your referral code: ${code}` : 'Referral code unavailable.');
    return true;
  }

  if (text.startsWith('/usecode')) {
    const code = text.split(/\s+/)[1];
    if (!code) {
      await ctx.reply('Usage: /usecode CODE');
      return true;
    }
    const applied = await referralService.applyReferral(ctx.state.user.id, code);
    await ctx.reply(applied ? 'Referral code applied.' : 'Could not apply referral code.');
    return true;
  }

  return false;
}

