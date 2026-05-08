import { env } from './env.js';
import { EnvValidationError } from '../utils/errors.js';

export const DAILY_FREE_GENERATIONS = 5;
export const CREDIT_COST_PER_GENERATION = 200;
export const MAX_FILE_SIZE_BYTES = 20_971_520;
export const ALLOWED_FILE_TYPES = ['pdf', 'docx', 'txt'] as const;
export const MESSAGE_CHUNK_SIZE = 4000;

export const ADMIN_TELEGRAM_IDS: bigint[] = env.ADMIN_TELEGRAM_IDS.split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    try {
      return BigInt(s);
    } catch {
      throw new EnvValidationError(
        `Invalid ADMIN_TELEGRAM_IDS entry "${s}". Use comma-separated numeric IDs.`,
      );
    }
  });

// #region agent log
fetch('http://127.0.0.1:7267/ingest/0744ad6d-27c0-4515-a012-a7a51da5b03c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'cc9f91'},body:JSON.stringify({sessionId:'cc9f91',runId:'initial',hypothesisId:'H3',location:'src/config/constants.ts:ADMIN_TELEGRAM_IDS',message:'Admin IDs parsed',data:{adminCount:ADMIN_TELEGRAM_IDS.length},timestamp:Date.now()})}).catch(()=>{});
// #endregion

