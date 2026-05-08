import Stripe from 'stripe';
import { bot } from '../../bot.js';
import { DAILY_FREE_GENERATIONS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';
import { logger } from '../../utils/logger.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' });

export class StripeService {
  private async sendAdminAlert(message: string): Promise<void> {
    if (!env.ADMIN_ALERT_CHANNEL_ID) return;
    await bot.telegram.sendMessage(Number(env.ADMIN_ALERT_CHANNEL_ID), message);
  }

  private async sendPaymentConfirmation(userId: string, creditsAdded: number): Promise<void> {
    const { data: user, error } = await supabase
      .from('users')
      .select('telegram_id,daily_generation_count,extra_credits')
      .eq('id', userId)
      .single();
    if (error) throw error;
    if (typeof user?.telegram_id !== 'number') return;

    const dailyUsed = (user.daily_generation_count as number | null) ?? 0;
    const extraCredits = (user.extra_credits as number | null) ?? 0;
    const dailyLeft = Math.max(0, DAILY_FREE_GENERATIONS - dailyUsed);

    await bot.telegram.sendMessage(
      user.telegram_id,
      `✅ Payment confirmed! ${creditsAdded} credit(s) added to your account.\nCredits remaining today: ${dailyLeft}/${DAILY_FREE_GENERATIONS} free | ${extraCredits} extra`,
    );
  }

  public async deductCredit(userId: string, actionType: string): Promise<boolean> {
    const rpcResult = await supabase.rpc('deduct_credit', {
      user_id: userId,
      action_type: actionType,
    });
    if (rpcResult.error) throw rpcResult.error;
    return Boolean(rpcResult.data);
  }

  public async createCheckoutSession(userId: string, pkg: 'single' | 'bundle'): Promise<string> {
    const config =
      pkg === 'single'
        ? { credits: 1, amount: 200, label: '1 Credit' }
        : { credits: 5, amount: 800, label: '5 Credits' };
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Orion Path - ${config.label}` },
            unit_amount: config.amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: { userId, credits: String(config.credits) },
      success_url: 'https://t.me/OrionPathBot?start=credits_success',
      cancel_url: 'https://t.me/OrionPathBot?start=credits_cancel',
    });
    if (!session.url) throw new Error('Stripe did not return checkout URL');
    return session.url;
  }

  public async handlePaymentSuccess(paymentIntentId: string, metadata: Record<string, string>): Promise<void> {
    const userId = metadata.userId;
    const credits = Number.parseInt(metadata.credits ?? '0', 10);
    if (!userId || Number.isNaN(credits) || credits <= 0) {
      logger.warn({ paymentIntentId, metadata }, 'Invalid payment metadata');
      return;
    }

    const { data: existing } = await supabase
      .from('payment_transactions')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (existing) return;

    const { error: rpcError } = await supabase.rpc('process_payment', {
      p_user_id: userId,
      p_payment_intent_id: paymentIntentId,
      p_credits: credits,
    });
    if (rpcError) throw rpcError;

    try {
      await this.sendPaymentConfirmation(userId, credits);
    } catch (notifyError) {
      logger.warn({ err: notifyError, userId }, 'Payment processed but confirmation message failed');
    }
  }

  public async handlePaymentFailed(paymentIntentId: string, metadata: Record<string, string>): Promise<void> {
    const userId = metadata.userId;
    if (!userId) return;

    const { data: user } = await supabase
      .from('users')
      .select('telegram_id')
      .eq('id', userId)
      .maybeSingle();
    if (typeof user?.telegram_id === 'number') {
      await bot.telegram.sendMessage(
        user.telegram_id,
        '❌ Payment failed. No credits were deducted. Please retry with /buy.',
      );
    }
    await this.sendAdminAlert(`⚠️ Payment failed for user ${userId} (intent: ${paymentIntentId}).`);
  }

  public async handleChargeRefunded(chargeId: string, paymentIntentId: string | null): Promise<void> {
    if (!paymentIntentId) {
      await this.sendAdminAlert(`⚠️ Refund received without payment_intent (charge: ${chargeId}).`);
      return;
    }

    const { data: txn, error } = await supabase
      .from('payment_transactions')
      .select('id,user_id,credits_purchased,status')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (error) throw error;
    if (!txn) {
      await this.sendAdminAlert(`⚠️ Refund received for unknown transaction (intent: ${paymentIntentId}).`);
      return;
    }

    if (txn.status === 'refunded') return;

    const creditsPurchased = (txn.credits_purchased as number | null) ?? 0;
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_id,extra_credits')
      .eq('id', txn.user_id as string)
      .single();
    if (userError) throw userError;

    const currentCredits = (user?.extra_credits as number | null) ?? 0;
    const nextCredits = Math.max(0, currentCredits - creditsPurchased);

    const { error: updateUserError } = await supabase
      .from('users')
      .update({ extra_credits: nextCredits, updated_at: new Date().toISOString() })
      .eq('id', txn.user_id as string);
    if (updateUserError) throw updateUserError;

    const { error: updateTxnError } = await supabase
      .from('payment_transactions')
      .update({ status: 'refunded' })
      .eq('id', txn.id as string);
    if (updateTxnError) throw updateTxnError;

    if (typeof user?.telegram_id === 'number') {
      await bot.telegram.sendMessage(
        user.telegram_id,
        `↩️ A refund was processed for your recent payment. ${creditsPurchased} credit(s) were reversed.`,
      );
    }
    await this.sendAdminAlert(
      `ℹ️ Refund processed (charge: ${chargeId}, intent: ${paymentIntentId}, user: ${txn.user_id}).`,
    );
  }
}

