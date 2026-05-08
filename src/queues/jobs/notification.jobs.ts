import { Queue } from 'bullmq';
import { createBullRedisConnection } from '../redis.connection.js';

export interface NotificationJobData {
  channel: 'telegram' | 'email';
  to: string;
  message: string;
}

const connection = createBullRedisConnection();
const queue = connection ? new Queue('notification_send', { connection }) : null;

export async function enqueueNotificationJob(data: NotificationJobData): Promise<void> {
  if (!queue) return;
  await queue.add('send-notification', data, { removeOnComplete: 1000, removeOnFail: 1000 });
}

