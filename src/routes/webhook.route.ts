import type { FastifyInstance } from 'fastify';
import type { Update } from 'telegraf/types';
import { bot } from '../bot.js';
import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

function extractUpdateId(update: Update): number | null {
  return typeof update.update_id === 'number' ? update.update_id : null;
}

export async function isReplayUpdate(update: Update): Promise<boolean> {
  const updateId = extractUpdateId(update);
  if (updateId === null) return false;
  const key = 'tg:seen_updates';
  const added = await redis.sadd(key, updateId.toString());
  await redis.expire(key, 60 * 60 * 24);
  return added === 0;
}

async function processUpdate(update: Update): Promise<void> {
  await bot.handleUpdate(update);
}

export function registerWebhookRoutes(fastify: FastifyInstance): void {
  fastify.post<{ Params: { secretToken: string }; Body: Update }>(
    '/webhook/:secretToken',
    async (req, reply) => {
      try {
        if (req.params.secretToken !== env.TELEGRAM_WEBHOOK_SECRET) {
          await reply.code(403).send();
          return;
        }

        // Always acknowledge quickly to avoid Telegram retries.
        await reply.code(200).send('OK');

        const update = req.body;
        if (await isReplayUpdate(update)) return;

        setImmediate(() => {
          void processUpdate(update).catch((err) => {
            logger.error({ err }, 'Failed to process Telegram update');
          });
        });
      } catch (err) {
        logger.error({ err }, 'Webhook handler error (swallowed)');
        // Telegram expects 200 even on internal errors to avoid retry storms.
        if (!reply.sent) await reply.code(200).send('OK');
      }
    },
  );
}

