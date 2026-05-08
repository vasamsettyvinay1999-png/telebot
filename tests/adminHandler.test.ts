import { describe, expect, it } from 'vitest';

describe('admin handler module', () => {
  it('loads registerAdminHandlers symbol', async () => {
    const mod = await import('../src/handlers/admin.handler.js');
    expect(typeof mod.registerAdminHandlers).toBe('function');
  });
});

