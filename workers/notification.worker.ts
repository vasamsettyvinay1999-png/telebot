import { startNotificationWorker } from '../src/queues/workers/notification.worker.js';
import { logger } from '../src/utils/logger.js';

const worker = startNotificationWorker();
if (!worker) {
  logger.warn('Notification worker did not start due to Redis configuration.');
  process.exit(0);
}

logger.info('Notification worker started');

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Shutting down notification worker');
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

