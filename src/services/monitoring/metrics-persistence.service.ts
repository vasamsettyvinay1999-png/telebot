import { supabase } from '../../config/supabase.js';
import { flushBufferedMetrics } from '../../utils/metrics.js';
import { logger } from '../../utils/logger.js';

export class MetricsPersistenceService {
  public async flushToDatabase(): Promise<{ written: number }> {
    const entries = flushBufferedMetrics();
    if (entries.length === 0) return { written: 0 };

    const payload = entries.map((entry) => ({
      metric_name: entry.name,
      metric_kind: entry.kind,
      metric_value: entry.value,
      observed_at: new Date(entry.ts).toISOString(),
    }));
    const { error } = await supabase.from('app_metric_snapshots').insert(payload);
    if (error) {
      logger.warn({ err: error }, 'Failed to persist metric snapshots');
      return { written: 0 };
    }
    return { written: payload.length };
  }
}

