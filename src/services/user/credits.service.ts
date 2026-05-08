import { supabase } from '../../config/supabase.js';
import { DAILY_FREE_GENERATIONS } from '../../config/constants.js';

export interface CreditBalance {
  dailyUsed: number;
  dailyRemaining: number;
  extraCredits: number;
}

export class CreditsService {
  public async getBalance(userId: string): Promise<CreditBalance> {
    const { data, error } = await supabase
      .from('users')
      .select('daily_generation_count,extra_credits')
      .eq('id', userId)
      .single();
    if (error) throw error;
    const dailyUsed = (data?.daily_generation_count as number | null) ?? 0;
    const extraCredits = (data?.extra_credits as number | null) ?? 0;
    return {
      dailyUsed,
      dailyRemaining: Math.max(0, DAILY_FREE_GENERATIONS - dailyUsed),
      extraCredits,
    };
  }

  public async adjustExtraCreditsByTelegramId(telegramId: number, delta: number): Promise<void> {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('extra_credits')
      .eq('telegram_id', telegramId)
      .single();
    if (fetchError) throw fetchError;
    const current = (user?.extra_credits as number | null) ?? 0;
    const next = Math.max(0, current + delta);
    const { error: updateError } = await supabase
      .from('users')
      .update({ extra_credits: next, updated_at: new Date().toISOString() })
      .eq('telegram_id', telegramId);
    if (updateError) throw updateError;
  }
}

