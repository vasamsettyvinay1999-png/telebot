import type { MiddlewareFn } from 'telegraf';
import { redis } from '../config/redis.js';
import type { AppContext } from '../types/bot-context.js';
import { defaultSessionState, type SessionState } from '../types/session.js';

const SESSION_TTL_SECONDS = 48 * 60 * 60;

function getSessionKey(userId: number): string {
  return `session:${userId}`;
}

function hydrateSession(raw: unknown): SessionState | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Partial<SessionState>;
      return { ...defaultSessionState(), ...parsed };
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...defaultSessionState(), ...(raw as Partial<SessionState>) };
  }
  return null;
}

export const sessionMiddleware: MiddlewareFn<AppContext> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) {
    ctx.session = defaultSessionState();
    await next();
    return;
  }

  const key = getSessionKey(userId);
  const rawSession = await redis.get(key);
  let session = hydrateSession(rawSession) ?? defaultSessionState();

  if (Date.now() - session.lastActivity > SESSION_TTL_SECONDS * 1000) {
    session = defaultSessionState();
  }

  ctx.session = session;
  await next();

  ctx.session.lastActivity = Date.now();
  await redis.set(key, JSON.stringify(ctx.session), { ex: SESSION_TTL_SECONDS });
};

