import { bot } from '../../bot.js';
import { supabase } from '../../config/supabase.js';
import { logger } from '../../utils/logger.js';
import { ApplicationTrackerService } from './application-tracker.service.js';

const tracker = new ApplicationTrackerService();

export class FollowUpReminderService {
  public async dispatchDueReminders(): Promise<{ sent: number; failed: number }> {
    const due = await tracker.listDueFollowUps(50);
    let sent = 0;
    let failed = 0;

    for (const row of due) {
      try {
        const { data: user, error } = await supabase
          .from('users')
          .select('telegram_id')
          .eq('id', row.userId)
          .maybeSingle();
        if (error) throw error;
        if (typeof user?.telegram_id !== 'number') {
          failed += 1;
          continue;
        }
        await bot.telegram.sendMessage(
          user.telegram_id,
          `🔔 Follow-up reminder: ${
            row.nextActionDate
              ? `Today is your planned next action date (${row.nextActionDate})`
              : `It's been about a week since you applied`
          } for ${row.company} - ${row.role}. Consider sending a polite follow-up note today.${
            row.notes ? `\nSaved note: ${row.notes.slice(0, 220)}` : ''
          }`,
        );
        await tracker.markFollowUpSent(row.applicationId);
        sent += 1;
      } catch (error) {
        logger.warn({ err: error, applicationId: row.applicationId }, 'Follow-up reminder send failed');
        failed += 1;
      }
    }

    return { sent, failed };
  }
}

