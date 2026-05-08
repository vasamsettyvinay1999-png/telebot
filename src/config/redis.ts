import { Redis } from '@upstash/redis';
import { env } from './env.js';

export const redis = new Redis({
  url: env.UPSTASH_REDIS_URL,
  token: env.UPSTASH_REDIS_TOKEN,
});

