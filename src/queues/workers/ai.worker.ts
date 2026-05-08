import { Worker } from 'bullmq';
import { ClaudeClient } from '../../services/ai/claude.client.js';
import { BASE_SYSTEM_PROMPT } from '../../prompts/system/base.prompt.js';
import { MemoryService } from '../../services/ai/memory.service.js';
import { createBullRedisConnection } from '../redis.connection.js';
import { logger } from '../../utils/logger.js';

const connection = createBullRedisConnection();

export function startAIWorker(): Worker | null {
  if (!connection) return null;
  const client = new ClaudeClient();
  const worker = new Worker(
    'ai_generation',
    async (job) => {
      const payload = (job.data as { payload?: { message?: string } }).payload;
      await client.complete(BASE_SYSTEM_PROMPT, payload?.message ?? '');
    },
    { connection, concurrency: 5 },
  );
  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'AI worker failed'));
  return worker;
}

export function startMemoryCompressionWorker(): Worker | null {
  if (!connection) return null;
  const client = new ClaudeClient();
  const memory = new MemoryService();
  const worker = new Worker(
    'memory_compress',
    async (job) => {
      const userId = (job.data as { userId?: string }).userId;
      if (!userId) return;
      const recent = await memory.getRecentMessages(userId);
      const text = recent.map((m) => `${m.role}: ${m.content}`).join('\n');
      const summary = await client.complete(
        BASE_SYSTEM_PROMPT,
        `Summarize this conversation in <=400 words:\n${text}`,
      );
      await memory.updateSummary(userId, summary.slice(0, 8000));
    },
    { connection, concurrency: 2 },
  );
  worker.on('failed', (job, err) =>
    logger.error({ err, jobId: job?.id }, 'Memory compression worker failed'),
  );
  return worker;
}

