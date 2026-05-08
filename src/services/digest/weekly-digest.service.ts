import { bot } from '../../bot.js';
import { UserService } from '../user/user.service.js';

const digestMessage =
  '📈 Weekly Market Pulse:\n- Hiring remains selective for senior roles.\n- ATS keyword alignment is increasingly important.\n- Keep tailoring resumes per job and follow up in 5-7 days.';

export class WeeklyDigestService {
  private readonly userService = new UserService();

  public async sendWeeklyDigest(): Promise<{ sent: number; failed: number }> {
    const users = await this.userService.listApprovedUsers();
    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegram_id, digestMessage);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    return { sent, failed };
  }
}

