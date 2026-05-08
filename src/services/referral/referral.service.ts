import { supabase } from '../../config/supabase.js';

export class ReferralService {
  public async getReferralCode(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data?.referral_code as string | null) ?? null;
  }

  public async applyReferral(userId: string, referralCode: string): Promise<boolean> {
    const { data: refUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', referralCode)
      .maybeSingle();
    if (error) throw error;
    if (!refUser?.id || refUser.id === userId) return false;

    const { error: updateError } = await supabase
      .from('users')
      .update({ referred_by: refUser.id, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (updateError) throw updateError;
    return true;
  }
}

