import { supabase } from '../../config/supabase.js';

export interface UserSummary {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  full_name: string | null;
  status: string;
  daily_generation_count: number;
  extra_credits: number;
}

export class UserService {
  public async listUsers(page = 1, pageSize = 10): Promise<UserSummary[]> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('users')
      .select(
        'id,telegram_id,telegram_username,full_name,status,daily_generation_count,extra_credits',
      )
      .range(from, to)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  public async getUserByTelegramId(telegramId: number): Promise<UserSummary | null> {
    const { data, error } = await supabase
      .from('users')
      .select(
        'id,telegram_id,telegram_username,full_name,status,daily_generation_count,extra_credits',
      )
      .eq('telegram_id', telegramId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  public async listApprovedUsers(): Promise<Array<{ id: string; telegram_id: number }>> {
    const { data, error } = await supabase
      .from('users')
      .select('id,telegram_id')
      .eq('status', 'approved');
    if (error) throw error;
    return data ?? [];
  }
}

