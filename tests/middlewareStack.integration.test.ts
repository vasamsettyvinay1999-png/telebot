import { describe, expect, it, vi } from 'vitest';
import type { Update } from 'telegraf/types';

const redisStore = new Map<string, string>();
const redisMock = {
  get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  set: vi.fn(async (key: string, value: string) => {
    redisStore.set(key, value);
    return 'OK';
  }),
  incr: vi.fn(async (_key: string) => 1),
  expire: vi.fn(async () => 1),
  sadd: vi.fn(async () => 1),
};

const userRow = {
  id: '00000000-0000-0000-0000-000000000001',
  telegram_id: 999001,
  telegram_username: 'test',
  telegram_first_name: 'Test',
  telegram_last_name: 'User',
  status: 'banned',
};

const supabaseMock = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: userRow, error: null })),
      })),
    })),
  })),
};

vi.mock('../src/config/redis.js', () => ({ redis: redisMock }));
vi.mock('../src/config/supabase.js', () => ({ supabase: supabaseMock }));

describe('middleware stack integration', () => {
  it('drops banned user update in middleware stack', async () => {
    const { bot } = await import('../src/bot.js');
    const callApi = vi
      .spyOn(bot.telegram, 'callApi')
      .mockResolvedValue({ message_id: 1 } as never);

    const { registerConversationHandlers } = await import('../src/handlers/conversation.handler.js');
    registerConversationHandlers();

    const update: Update = {
      update_id: 2000,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 999001, type: 'private' },
        from: { id: 999001, is_bot: false, first_name: 'Test' },
        text: 'hello',
      },
    };

    await bot.handleUpdate(update);
    const sendMessageCalls = callApi.mock.calls.filter(([method]) => method === 'sendMessage');
    expect(sendMessageCalls).toHaveLength(0);
  });
});

