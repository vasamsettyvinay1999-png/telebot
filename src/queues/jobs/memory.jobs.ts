import { Queue } from 'bullmq';
import { createBullRedisConnection } from '../redis.connection.js';

export interface MemoryCompressionJobData {
  userId: string;
}

const connection = createBullRedisConnection();
const queue = connection ? new Queue('memory_compress', { connection }) : null;

export async function enqueueMemoryCompressionJob(data: MemoryCompressionJobData): Promise<void> {
  if (!queue) return;
  await queue.add('compress-memory', data, {
    removeOnComplete: 1000,
    removeOnFail: 1000,
    attempts: 2,
  });
}

