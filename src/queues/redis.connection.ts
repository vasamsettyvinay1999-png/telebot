import { Redis as IORedis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface BullRedisConfig {
  url: string;
  token: string;
}

export function getBullRedisConfig(): BullRedisConfig {
  const bullmqUrl = env.BULLMQ_REDIS_URL?.trim();
  const bullmqToken = env.BULLMQ_REDIS_TOKEN?.trim();
  return {
    url: bullmqUrl && bullmqUrl.length > 0 ? bullmqUrl : env.UPSTASH_REDIS_URL,
    token: bullmqToken && bullmqToken.length > 0 ? bullmqToken : env.UPSTASH_REDIS_TOKEN,
  };
}

export function createBullRedisConnection(): IORedis | null {
  if (env.NODE_ENV === 'test') {
    return null;
  }
  const { url, token } = getBullRedisConfig();
  const protocol = new URL(url).protocol;
  // #region agent log
  fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'initial',hypothesisId:'H4',location:'src/queues/redis.connection.ts:createBullRedisConnection',message:'Evaluating BullMQ Redis compatibility',data:{selectedProtocol:protocol,usingBullOverride:Boolean(env.BULLMQ_REDIS_URL&&env.BULLMQ_REDIS_URL.trim().length>0),tokenPresent:token.trim().length>0,nodeEnv:env.NODE_ENV},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (!['redis:', 'rediss:'].includes(protocol)) {
    logger.warn(
      'BullMQ disabled: Redis URL must be redis:// or rediss://. Set BULLMQ_REDIS_URL explicitly.',
    );
    return null;
  }
  return new IORedis(url, {
    password: token,
    maxRetriesPerRequest: null,
  });
}

