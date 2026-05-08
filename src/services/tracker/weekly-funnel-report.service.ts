import { bot } from '../../bot.js';
import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';

interface FunnelSnapshot {
  applied: number;
  screening: number;
  interview: number;
  offer: number;
  rejected: number;
  withdrawn: number;
}

const SNAPSHOT_KEYS: Array<keyof FunnelSnapshot> = [
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];

function emptySnapshot(): FunnelSnapshot {
  return {
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
  };
}

function toPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function sumSnapshot(snapshot: FunnelSnapshot): number {
  return (
    snapshot.applied +
    snapshot.screening +
    snapshot.interview +
    snapshot.offer +
    snapshot.rejected +
    snapshot.withdrawn
  );
}

export class WeeklyFunnelReportService {
  public async sendWeeklyReport(): Promise<{ sent: boolean; thisWeekTotal: number }> {
    if (!env.ADMIN_ALERT_CHANNEL_ID) return { sent: false, thisWeekTotal: 0 };

    const today = new Date();
    const startThisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startPrevWeek = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [thisWeek, prevWeek, staleCount] = await Promise.all([
      this.fetchSnapshot(startThisWeek.toISOString(), today.toISOString()),
      this.fetchSnapshot(startPrevWeek.toISOString(), startThisWeek.toISOString()),
      this.fetchStaleCount(),
    ]);

    const thisTotal = sumSnapshot(thisWeek);
    const prevTotal = sumSnapshot(prevWeek);
    const interviewRate = thisWeek.applied > 0 ? (thisWeek.interview / thisWeek.applied) * 100 : 0;
    const offerFromInterview = thisWeek.interview > 0 ? (thisWeek.offer / thisWeek.interview) * 100 : 0;
    const deltaTotal = thisTotal - prevTotal;

    await bot.telegram.sendMessage(
      Number(env.ADMIN_ALERT_CHANNEL_ID),
      `📈 Weekly funnel report
This week total transitions: ${thisTotal} (${deltaTotal >= 0 ? '+' : ''}${deltaTotal} vs prev week)
Applied: ${thisWeek.applied}
Screening: ${thisWeek.screening}
Interview: ${thisWeek.interview}
Offer: ${thisWeek.offer}
Rejected: ${thisWeek.rejected}
Withdrawn: ${thisWeek.withdrawn}
Interview rate: ${toPct(interviewRate)}
Offer-from-interview: ${toPct(offerFromInterview)}
Stale applied (>14 days): ${staleCount}`,
    );

    return { sent: true, thisWeekTotal: thisTotal };
  }

  private async fetchSnapshot(startIso: string, endIso: string): Promise<FunnelSnapshot> {
    const { data, error } = await supabase
      .from('application_tracker')
      .select('status')
      .gte('updated_at', startIso)
      .lt('updated_at', endIso);
    if (error) throw error;

    const snap = emptySnapshot();
    for (const row of (data ?? []) as Array<{ status?: unknown }>) {
      const rawStatus = row.status;
      if (typeof rawStatus !== 'string') continue;
      const status = rawStatus as keyof FunnelSnapshot;
      if (SNAPSHOT_KEYS.includes(status)) {
        snap[status] += 1;
      }
    }
    return snap;
  }

  private async fetchStaleCount(): Promise<number> {
    const threshold = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { count, error } = await supabase
      .from('application_tracker')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'applied')
      .lte('applied_date', threshold);
    if (error) throw error;
    return count ?? 0;
  }
}

