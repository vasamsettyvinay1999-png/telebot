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

