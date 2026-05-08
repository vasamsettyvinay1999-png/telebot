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
import { ADMIN_TELEGRAM_IDS } from './config/constants.js';

const DEPLOY_MARKER = 'DEPLOY_MARKER_ONBOARDING_SKIP_V3';

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

fastify.get('/health', async (_req, reply) => {
  let supabaseOk = true;
  let redisOk = true;
  try {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) supabaseOk = false;
  } catch {
    supabaseOk = false;
  }
  try {
    await redis.ping();
  } catch {
    redisOk = false;
  }
  const statusCode = supabaseOk && redisOk ? 200 : 503;
  await reply.code(statusCode).send({
    status: statusCode === 200 ? 'ok' : 'degraded',
    service: 'orion-path',
    envLoaded: true,
    checks: {
      supabase: supabaseOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

fastify.get('/ready', async (_req, reply) => {
  try {
    await redis.ping();
    const { error } = await supabase.from('users').select('id').limit(1);
    if (error) throw error;
    await reply.code(200).send({ status: 'ready' });
  } catch {
    await reply.code(503).send({ status: 'not_ready' });
  }
});

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
    // #region agent log
    fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'initial',hypothesisId:'H5',location:'src/server.ts:verifyDependencies:redis',message:'Redis ping succeeded',data:{nodeEnv:env.NODE_ENV},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'initial',hypothesisId:'H5',location:'src/server.ts:verifyDependencies:redis',message:'Redis ping failed',data:{nodeEnv:env.NODE_ENV,error:String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    logger.fatal({ err }, 'Redis ping failed');
    throw err;
  }

  // Best-effort Supabase check. This will succeed only after migrations.
  try {
    await supabase.from('users').select('id').limit(1);
    // #region agent log
    fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'initial',hypothesisId:'H5',location:'src/server.ts:verifyDependencies:supabase',message:'Supabase check executed',data:{table:'users'},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'initial',hypothesisId:'H5',location:'src/server.ts:verifyDependencies:supabase',message:'Supabase check failed',data:{table:'users',error:String(err)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    logger.warn({ err }, 'Supabase check failed (likely before migrations)');
  }
}

async function startTelegramUpdateIngestion(): Promise<void> {
  const mode = env.NODE_ENV === 'production' ? 'webhook' : env.TELEGRAM_USE_POLLING ? 'polling' : 'webhook';
  const webhookPath = '/webhook/telegram';
  logger.info(
    { mode, appUrl: env.APP_URL, webhookPath, nodeEnv: env.NODE_ENV },
    'Initializing Telegram update ingestion',
  );
  logger.info({ adminCount: ADMIN_TELEGRAM_IDS.length }, 'Admin configuration loaded');
  // #region agent log
  fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'post-fix',hypothesisId:'H1',location:'src/server.ts:startTelegramUpdateIngestion:entry',message:'Evaluating Telegram ingestion mode',data:{nodeEnv:env.NODE_ENV,usePollingEnv:env.TELEGRAM_USE_POLLING,port:env.PORT,mode},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    const me = await bot.telegram.getMe();
    logger.info({ botUsername: me.username }, 'Telegram bot identity resolved');
  } catch (err) {
    logger.warn({ err }, 'Could not resolve Telegram bot identity');
  }
  if (mode !== 'polling') {
    if (env.NODE_ENV === 'development') {
      logger.warn(
        {
          mode,
          appUrl: env.APP_URL ?? null,
          hint: 'Set TELEGRAM_USE_POLLING=true for local bot replies unless webhook is publicly reachable',
        },
        'Local dev running in webhook mode',
      );
    }
    logger.info({ mode, webhookPath, appUrl: env.APP_URL }, 'Telegram webhook mode active; polling disabled');
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

logger.info({ marker: DEPLOY_MARKER }, 'Startup marker');

await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
logger.info({ port: env.PORT }, 'Server listening');
// #region agent log
fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'post-fix',hypothesisId:'H1',location:'src/server.ts:listen',message:'Server started',data:{port:env.PORT,nodeEnv:env.NODE_ENV,pollingEnabled:env.TELEGRAM_USE_POLLING},timestamp:Date.now()})}).catch(()=>{});
// #endregion

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Shutdown signal received');
  try {
    await fastify.close();
    try {
      bot.stop(signal);
    } catch (err) {
      logger.warn({ err }, 'Bot stop ignored');
    }
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

