import { redis } from '../../config/redis.js';
import { supabase } from '../../config/supabase.js';
import { enqueueMemoryCompressionJob } from '../../queues/jobs/memory.jobs.js';

export interface MemoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  intentType?: string;
}

export class MemoryService {
  public async addMessage(userId: string, message: MemoryMessage): Promise<void> {
    const key = `conv:${userId}:messages`;
    await redis.lpush(key, JSON.stringify(message));
    await redis.ltrim(key, 0, 19);
    await redis.expire(key, 24 * 60 * 60);

    const countKey = `conv:${userId}:count`;
    const count = await redis.incr(countKey);
    await redis.expire(countKey, 24 * 60 * 60);
    if (count % 20 === 0) {
      await enqueueMemoryCompressionJob({ userId });
    }
  }

  public async getRecentMessages(userId: string): Promise<MemoryMessage[]> {
    const key = `conv:${userId}:messages`;
    const items = (await redis.lrange<string>(key, 0, 19)) ?? [];
    return items
      .map((item) => {
        try {
          return JSON.parse(item) as MemoryMessage;
        } catch {
          return null;
        }
      })
      .filter((item): item is MemoryMessage => item !== null)
      .reverse();
  }

  public async getSummary(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('users')
      .select('session_summary')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return (data?.session_summary as string | null) ?? null;
  }

  public async updateSummary(userId: string, summary: string): Promise<void> {
    const { error } = await supabase
      .from('users')
      .update({ session_summary: summary, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
  }
}

