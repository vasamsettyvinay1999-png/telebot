import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { bot } from './bot.js';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { supabase } from './config/supabase.js';
import { registerConversationHandlers } from './handlers/conversation.handler.js';
import { registerAdminRoutes } from './routes/admin.route.js';
import { registerStripeRoutes } from './routes/stripe.route.js';
import { startQueueMonitor } from './services/monitoring/queue.monitor.js';
import { startSchedulers } from './services/scheduler/scheduler.service.js';
import { registerWebhookRoutes } from './routes/webhook.route.js';
import { logger, loggerOptions } from './utils/logger.js';
import { gauge, increment, timing } from './utils/metrics.js';

const fastify = Fastify({
  logger: loggerOptions,
  disableRequestLogging: env.NODE_ENV === 'production',
}) as unknown as FastifyInstance;

const requestStartTs = new WeakMap<object, number>();

fastify.addHook('onRequest', (req, _reply, done) => {
  requestStartTs.set(req, Date.now());
  increment('http.requests.total');
  done();
});

fastify.addHook('onResponse', (req, reply, done) => {
  const startTs = requestStartTs.get(req);
  if (typeof startTs === 'number') {
    timing('http.request.duration_ms', Date.now() - startTs);
  }
  if (reply.statusCode >= 500) increment('http.responses.5xx');
  else if (reply.statusCode >= 400) increment('http.responses.4xx');
  else increment('http.responses.2xx_3xx');
  done();
});

fastify.setErrorHandler(async (error, _req, reply) => {
  logger.error({ err: error }, 'Unhandled request error');
  const statusCode =
    typeof (error as { statusCode?: number }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
  const message = error instanceof Error ? error.message : 'Unknown error';
  await reply.code(statusCode).send({
    error: {
      code: (error as { code?: string }).code ?? 'INTERNAL_ERROR',
      message: statusCode >= 500 ? 'Internal Server Error' : message,
    },
  });
});

await fastify.register(rawBody, {
  field: 'rawBody',
  global: false,
  encoding: false,
  runFirst: true,
});

await fastify.register(cors, {
  origin: env.NODE_ENV === 'development' ? true : false,
});

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  hook: 'onRequest',
});

fastify.get('/health', () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
}));

registerWebhookRoutes(fastify);
registerAdminRoutes(fastify);
registerStripeRoutes(fastify);
registerConversationHandlers();
const queueMonitor = startQueueMonitor();
const schedulerIntervals = startSchedulers();
gauge('process.boot.timestamp', Date.now());

async function verifyDependencies(): Promise<void> {
  try {
    await redis.ping();
  } catch (err) {
    logger.fatal({ err }, 'Redis ping failed');
    throw err;
  }

  // Best-effort Supabase check. This will succeed only after migrations.
  try {
    await supabase.from('users').select('id').limit(1);
  } catch (err) {
    logger.warn({ err }, 'Supabase check failed (likely before migrations)');
  }
}

async function startTelegramUpdateIngestion(): Promise<void> {
  logger.info('Initializing Telegram update ingestion');
  if (process.env.TELEGRAM_ENABLE_POLLING !== 'true') {
    logger.info('Skipping Telegram long polling (TELEGRAM_ENABLE_POLLING is not true)');
    return;
  }
  // Fire-and-forget startup so API boot is never blocked by Telegram network latency.
  void bot.telegram
    .deleteWebhook({ drop_pending_updates: false })
    .catch((err) => {
      logger.warn({ err }, 'Failed to clear Telegram webhook before polling');
    })
    .then(async () => {
      await bot.launch({ dropPendingUpdates: false });
      logger.info(
        { botUsername: bot.botInfo?.username },
        'Telegram long polling enabled (no webhook configured)',
      );
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to start Telegram long polling');
    });
}

await verifyDependencies();
void startTelegramUpdateIngestion().catch((err) => {
  logger.error({ err }, 'Failed to start Telegram update ingestion');
});

await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
logger.info({ port: env.PORT }, 'Server listening');

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Shutdown signal received');
  try {
    await fastify.close();
    bot.stop(signal);
    if (queueMonitor) clearInterval(queueMonitor);
    schedulerIntervals.forEach((timer) => clearInterval(timer));
    logger.info('Fastify closed');
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
  } finally {
    process.exit(0);
  }
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

