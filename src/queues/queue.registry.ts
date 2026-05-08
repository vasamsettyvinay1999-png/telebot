import { Queue } from 'bullmq';
import { createBullRedisConnection } from './redis.connection.js';

export const QUEUE_NAMES = {
  FILE_PROCESSING: 'file_processing',
} as const;

const redisConnection = createBullRedisConnection();

function createQueue(name: string): Queue | null {
  if (!redisConnection) return null;
  return new Queue(name, { connection: redisConnection });
}

export const queues = {
  fileProcessing: createQueue(QUEUE_NAMES.FILE_PROCESSING),
};

