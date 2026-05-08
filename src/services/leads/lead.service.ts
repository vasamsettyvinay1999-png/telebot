import { supabase } from '../../config/supabase.js';

export class LeadService {
  public async upsertLead(telegramId: number, username: string | null): Promise<void> {
    const { error } = await supabase.from('leads').upsert(
      { telegram_id: telegramId, telegram_username: username, updated_at: new Date().toISOString() },
      { onConflict: 'telegram_id' },
    );
    if (error) throw error;
  }

  public async addSignal(telegramId: number, signal: string, scoreDelta: number): Promise<void> {
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('id,lead_score,intent_signals')
      .eq('telegram_id', telegramId)
      .single();
    if (fetchError) throw fetchError;
    const currentSignals = (lead.intent_signals as Array<{ signal: string; ts: string }> | null) ?? [];
    currentSignals.push({ signal, ts: new Date().toISOString() });
    const { error } = await supabase
      .from('leads')
      .update({
        lead_score: ((lead.lead_score as number | null) ?? 0) + scoreDelta,
        intent_signals: currentSignals,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id as string);
    if (error) throw error;
  }
}

