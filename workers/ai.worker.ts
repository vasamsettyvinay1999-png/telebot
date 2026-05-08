import { startAIWorker, startMemoryCompressionWorker } from '../src/queues/workers/ai.worker.js';
import { logger } from '../src/utils/logger.js';

const aiWorker = startAIWorker();
const memoryWorker = startMemoryCompressionWorker();

if (!aiWorker && !memoryWorker) {
  logger.warn('AI workers did not start due to Redis configuration.');
  process.exit(0);
}

logger.info('AI workers started');

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Shutting down AI workers');
  await Promise.all([aiWorker?.close(), memoryWorker?.close()]);
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

