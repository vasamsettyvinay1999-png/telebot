import { env } from './env.js';

export const DAILY_FREE_GENERATIONS = 5;
export const CREDIT_COST_PER_GENERATION = 200;
export const MAX_FILE_SIZE_BYTES = 20_971_520;
export const ALLOWED_FILE_TYPES = ['pdf', 'docx', 'txt'] as const;
export const MESSAGE_CHUNK_SIZE = 4000;

export const ADMIN_TELEGRAM_IDS: bigint[] = env.ADMIN_TELEGRAM_IDS.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => BigInt(s));

