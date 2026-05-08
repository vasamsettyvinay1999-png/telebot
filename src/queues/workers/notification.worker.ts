import { Worker } from 'bullmq';
import { EmailNotifier } from '../../services/notifications/email.notifier.js';
import { TelegramNotifier } from '../../services/notifications/telegram.notifier.js';
import { createBullRedisConnection } from '../redis.connection.js';
import { logger } from '../../utils/logger.js';

const connection = createBullRedisConnection();

export function startNotificationWorker(): Worker | null {
  if (!connection) return null;
  const email = new EmailNotifier();
  const tg = new TelegramNotifier();
  const worker = new Worker(
    'notification_send',
    async (job) => {
      const data = job.data as { channel: 'telegram' | 'email'; to: string; message: string };
      if (data.channel === 'email') {
        const now = new Date();
        await email.sendBookingConfirmation({
          email: data.to,
          startIso: now.toISOString(),
          endIso: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
          details: data.message,
        });
      } else {
        await tg.sendMessage(Number(data.to), data.message);
      }
    },
    { connection, concurrency: 20 },
  );
  worker.on('failed', (job, err) =>
    logger.error({ err, jobId: job?.id }, 'Notification worker failed'),
  );
  return worker;
}

