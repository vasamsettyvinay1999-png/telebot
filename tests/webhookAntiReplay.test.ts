import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Update } from 'telegraf/types';

const redisMock = {
  sadd: vi.fn(),
  expire: vi.fn(),
};

vi.mock('../src/config/redis.js', () => ({
  redis: redisMock,
}));

describe('webhook anti replay', () => {
  beforeEach(() => {
    redisMock.sadd.mockReset();
    redisMock.expire.mockReset();
  });

  it('flags duplicate updates as replay', async () => {
    redisMock.sadd.mockResolvedValueOnce(0);
    redisMock.expire.mockResolvedValueOnce(1);

    const { isReplayUpdate } = await import('../src/routes/webhook.route.js');
    const replay = await isReplayUpdate({ update_id: 10 } as Update);
    expect(replay).toBe(true);
  });

  it('marks unseen update as non-replay', async () => {
    redisMock.sadd.mockResolvedValueOnce(1);
    redisMock.expire.mockResolvedValueOnce(1);

    const { isReplayUpdate } = await import('../src/routes/webhook.route.js');
    const replay = await isReplayUpdate({ update_id: 11 } as Update);
    expect(replay).toBe(false);
  });
});

