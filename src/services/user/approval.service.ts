import { supabase } from '../../config/supabase.js';

export class ApprovalService {
  public async setStatusByTelegramId(
    telegramId: number,
    status: 'approved' | 'rejected' | 'banned' | 'pending_approval',
    adminTelegramId: number,
  ): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({
        status,
        approved_by: adminTelegramId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('telegram_id', telegramId);
    if (error) throw error;
  }

  public async setStatusByUserId(
    userId: string,
    status: 'approved' | 'rejected' | 'banned' | 'pending_approval',
    adminTelegramId: number,
  ): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({
        status,
        approved_by: adminTelegramId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) throw error;
  }
}

