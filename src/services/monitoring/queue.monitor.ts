import { env } from '../../config/env.js';
import { queues } from '../../queues/queue.registry.js';
import { bot } from '../../bot.js';
import { logger } from '../../utils/logger.js';

const ALERT_THRESHOLD = 50;

export function startQueueMonitor(): NodeJS.Timeout | null {
  if (!queues.fileProcessing) return null;
  if (!env.ADMIN_ALERT_CHANNEL_ID) return null;

  const timer = setInterval(() => {
    void (async () => {
      try {
        const waiting = await queues.fileProcessing?.getWaitingCount();
        if (typeof waiting === 'number' && waiting > ALERT_THRESHOLD) {
          await bot.telegram.sendMessage(
            Number(env.ADMIN_ALERT_CHANNEL_ID),
            `⚠️ Queue alert: file_processing waiting=${waiting}`,
          );
        }
      } catch (error) {
        logger.error({ err: error }, 'Queue monitor iteration failed');
      }
    })();
  }, 5 * 60 * 1000);

  return timer;
}

