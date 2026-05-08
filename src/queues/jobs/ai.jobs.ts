import { Queue } from 'bullmq';
import { createBullRedisConnection } from '../redis.connection.js';

export interface AIJobData {
  userId: string;
  intent: string;
  payload: Record<string, unknown>;
}

const connection = createBullRedisConnection();
const aiQueue = connection ? new Queue('ai_generation', { connection }) : null;

export async function enqueueAIJob(data: AIJobData): Promise<void> {
  if (!aiQueue) return;
  await aiQueue.add('run-ai', data, {
    attempts: 2,
    priority: 2,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
}

