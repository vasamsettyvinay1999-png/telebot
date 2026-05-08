import { supabase } from '../../config/supabase.js';

export class AdminAuditService {
  public async logAction(input: {
    adminTelegramId: number;
    actionType: string;
    targetTelegramId?: number;
    targetUserId?: string;
    actionData?: Record<string, unknown>;
    notes?: string;
  }): Promise<void> {
    await supabase.from('admin_actions').insert({
      admin_telegram_id: input.adminTelegramId,
      action_type: input.actionType,
      target_user_id: input.targetUserId ?? null,
      target_telegram_id: input.targetTelegramId ?? null,
      action_data: input.actionData ?? null,
      notes: input.notes ?? null,
    });
  }
}

