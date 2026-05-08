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
  await Promise.race([
    bot.handleUpdate(update),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Telegraf handleUpdate timeout')), 8000),
    ),
  ]);
}

function extractChatId(update: Update): number | null {
  if ('message' in update && update.message && 'chat' in update.message) return update.message.chat.id;
  if ('edited_message' in update && update.edited_message && 'chat' in update.edited_message)
    return update.edited_message.chat.id;
  if (
    'callback_query' in update &&
    update.callback_query &&
    'message' in update.callback_query &&
    update.callback_query.message &&
    'chat' in update.callback_query.message
  ) {
    return update.callback_query.message.chat.id;
  }
  return null;
}

export function registerWebhookRoutes(fastify: FastifyInstance): void {
  fastify.post<{ Body: Update }>(
    '/webhook/telegram',
    async (req, reply) => {
      try {
        const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
        const providedSecret = typeof secretHeader === 'string' ? secretHeader : '';
        // #region agent log
        fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'post-fix',hypothesisId:'H2',location:'src/routes/webhook.route.ts:handler:entry',message:'Telegram webhook request received',data:{providedSecretLength:providedSecret.length,expectedSecretLength:env.TELEGRAM_WEBHOOK_SECRET.length,secretMatched:providedSecret===env.TELEGRAM_WEBHOOK_SECRET,updateId:extractUpdateId(req.body)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (providedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
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
            const chatId = extractChatId(update);
            if (typeof chatId === 'number') {
              void bot.telegram
                .sendMessage(
                  chatId,
                  'Temporary processing issue. Please resend your last message in a few seconds.',
                )
                .catch((sendErr) => {
                  logger.error({ err: sendErr, chatId }, 'Failed to send webhook fallback message');
                });
            }
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

