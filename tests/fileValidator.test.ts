import { describe, expect, it } from 'vitest';
import { detectFileType, validateMagicBytes } from '../src/utils/fileValidator.js';

describe('file validator', () => {
  it('validates pdf magic bytes', async () => {
    const buffer = Buffer.from('%PDF-test-content');
    await expect(validateMagicBytes(buffer, 'pdf')).resolves.toBe(true);
  });

  it('detects txt file fallback', async () => {
    const buffer = Buffer.from('plain text');
    await expect(detectFileType(buffer)).resolves.toBe('txt');
  });
});

