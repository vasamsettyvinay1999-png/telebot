import { describe, expect, it } from 'vitest';
import { chunkMessage } from '../src/utils/chunker.js';

describe('chunkMessage', () => {
  it('returns single chunk when under max', () => {
    expect(chunkMessage('hello', 10)).toEqual(['hello']);
  });

  it('splits large text and adds continuation markers', () => {
    const input = ['a'.repeat(30), 'b'.repeat(30), 'c'.repeat(30)].join('\n\n');
    const chunks = chunkMessage(input, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain('(...continued)');
    expect(chunks[chunks.length - 1]).toContain('(...continued)');
  });
});

