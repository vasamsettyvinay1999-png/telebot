import { startFileWorker } from '../src/queues/workers/file.worker.js';
import { logger } from '../src/utils/logger.js';

const worker = startFileWorker();

if (!worker) {
  logger.warn('File worker did not start due to Redis configuration.');
  process.exit(0);
}

logger.info('File worker started');

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Shutting down file worker');
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

