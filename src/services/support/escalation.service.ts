import { supabase } from '../../config/supabase.js';
import { UserService } from '../user/user.service.js';

export interface EscalationCase {
  id: string;
  user_id: string;
  reason: string;
  urgency: string;
  source_message: string;
  status: string;
  created_at: string;
  trigger_type?: string | null;
  similarity_score?: number | null;
  assigned_admin_telegram_id?: number | null;
  resolution_note?: string | null;
  resolved_at?: string | null;
}

const userService = new UserService();

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export class EscalationService {
  public async createCase(input: {
    userId: string;
    reason: string;
    urgency: string;
    sourceMessage: string;
    triggerType?: string;
    similarityScore?: number | null;
  }): Promise<void> {
    const { data, error } = await supabase
      .from('escalations')
      .insert({
      user_id: input.userId,
      reason: input.reason,
      urgency: input.urgency,
      source_message: input.sourceMessage.slice(0, 1000),
      status: 'open',
      trigger_type: input.triggerType ?? null,
      similarity_score: input.similarityScore ?? null,
      })
      .select('id')
      .maybeSingle();
    if (error) throw error;
    const createdCaseId = typeof data?.id === 'string' ? data.id : null;
    if (createdCaseId) {
      const { error: eventError } = await supabase.from('escalation_events').insert({
        escalation_id: createdCaseId,
        actor_type: 'system',
        actor_telegram_id: null,
        event_type: 'case_created',
        note: input.reason.slice(0, 400),
      });
      if (eventError) throw eventError;
    }
  }

  public async listOpenCases(limit = 20): Promise<EscalationCase[]> {
    const { data, error } = await supabase
      .from('escalations')
      .select(
        'id,user_id,reason,urgency,source_message,status,created_at,trigger_type,similarity_score,assigned_admin_telegram_id',
      )
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  public async getCaseById(caseId: string): Promise<EscalationCase | null> {
    const { data, error } = await supabase
      .from('escalations')
      .select(
        'id,user_id,reason,urgency,source_message,status,created_at,trigger_type,similarity_score,assigned_admin_telegram_id,resolution_note,resolved_at',
      )
      .eq('id', caseId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  public async assignCase(caseId: string, adminTelegramId: number | null): Promise<boolean> {
    const { data, error } = await supabase
      .from('escalations')
      .update({
        assigned_admin_telegram_id: adminTelegramId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)
      .eq('status', 'open')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return Boolean(data?.id);
  }

  public async addOperatorNote(input: {
    caseId: string;
    adminTelegramId: number;
    note: string;
  }): Promise<void> {
    const { error } = await supabase.from('escalation_events').insert({
      escalation_id: input.caseId,
      actor_type: 'admin',
      actor_telegram_id: input.adminTelegramId,
      event_type: 'operator_note',
      note: input.note.slice(0, 2000),
    });
    if (error) throw error;
  }

  public async listCaseEvents(caseId: string, limit = 15): Promise<
    Array<{
      id: string;
      actor_type: string;
      actor_telegram_id: number | null;
      event_type: string;
      note: string | null;
      created_at: string;
    }>
  > {
    const { data, error } = await supabase
      .from('escalation_events')
      .select('id,actor_type,actor_telegram_id,event_type,note,created_at')
      .eq('escalation_id', caseId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  public async resolveCase(
    caseOrTelegramId: string,
    adminTelegramId: number,
    resolutionNote?: string,
  ): Promise<string | null> {
    if (isUuid(caseOrTelegramId)) {
      const { data, error } = await supabase
        .from('escalations')
        .select('id')
        .eq('id', caseOrTelegramId)
        .eq('status', 'open')
        .maybeSingle();
      if (error) throw error;
      const caseId = typeof data?.id === 'string' ? data.id : null;
      if (!caseId) return null;
      const { error: updateError } = await supabase
        .from('escalations')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by_admin_telegram_id: adminTelegramId,
          resolution_note: resolutionNote ? resolutionNote.slice(0, 500) : null,
        })
        .eq('id', caseId);
      if (updateError) throw updateError;
      const { error: eventError } = await supabase.from('escalation_events').insert({
        escalation_id: caseId,
        actor_type: 'admin',
        actor_telegram_id: adminTelegramId,
        event_type: 'case_resolved',
        note: resolutionNote ? resolutionNote.slice(0, 400) : null,
      });
      if (eventError) throw eventError;
      return caseId;
    }

    const telegramId = Number.parseInt(caseOrTelegramId, 10);
    if (Number.isNaN(telegramId)) return null;
    const user = await userService.getUserByTelegramId(telegramId);
    if (!user?.id) return null;

    const { data: latestOpen, error } = await supabase
      .from('escalations')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const latestCaseId = typeof latestOpen?.id === 'string' ? latestOpen.id : null;
    if (!latestCaseId) return null;

    const { error: updateError } = await supabase
      .from('escalations')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolved_by_admin_telegram_id: adminTelegramId,
        resolution_note: resolutionNote ? resolutionNote.slice(0, 500) : null,
      })
      .eq('id', latestCaseId);
    if (updateError) throw updateError;
    const { error: eventError } = await supabase.from('escalation_events').insert({
      escalation_id: latestCaseId,
      actor_type: 'admin',
      actor_telegram_id: adminTelegramId,
      event_type: 'case_resolved',
      note: resolutionNote ? resolutionNote.slice(0, 400) : null,
    });
    if (eventError) throw eventError;
    return latestCaseId;
  }
}

