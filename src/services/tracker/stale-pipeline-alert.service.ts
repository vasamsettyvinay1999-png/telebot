import { bot } from '../../bot.js';
import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';
import { logger } from '../../utils/logger.js';

export class StalePipelineAlertService {
  public async sendStalePipelineAlert(): Promise<{ alerted: boolean; staleCount: number }> {
    if (!env.ADMIN_ALERT_CHANNEL_ID) return { alerted: false, staleCount: 0 };

    const threshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('application_tracker')
      .select('id,company,role,applied_date')
      .eq('status', 'applied')
      .lte('applied_date', threshold)
      .order('applied_date', { ascending: true })
      .limit(25);
    if (error) throw error;

    const stale = data ?? [];
    if (stale.length < 5) return { alerted: false, staleCount: stale.length };

    try {
      await bot.telegram.sendMessage(
        Number(env.ADMIN_ALERT_CHANNEL_ID),
        `⚠️ Stale pipeline alert\n${stale.length} applications are still in "applied" for 14+ days.\nExamples:\n${stale
          .slice(0, 5)
          .map((r, i) => `${i + 1}. ${String(r.company)} | ${String(r.role)} | applied ${String(r.applied_date)}`)
          .join('\n')}`,
      );
      return { alerted: true, staleCount: stale.length };
    } catch (error) {
      logger.warn({ err: error }, 'Failed to send stale pipeline admin alert');
      return { alerted: false, staleCount: stale.length };
    }
  }
}

