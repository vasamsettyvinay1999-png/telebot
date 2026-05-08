import JSZip from 'jszip';

export type FileType = 'pdf' | 'docx' | 'txt';

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

export async function validateMagicBytes(buffer: Buffer, expectedType: FileType): Promise<boolean> {
  if (expectedType === 'pdf') {
    // %PDF
    return startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46]);
  }
  if (expectedType === 'docx') {
    // ZIP header
    if (!startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) return false;
    try {
      const zip = await JSZip.loadAsync(buffer);
      return Object.prototype.hasOwnProperty.call(zip.files, '[Content_Types].xml');
    } catch {
      return false;
    }
  }

  // TXT check: valid UTF-8 decode fallback.
  try {
    const asUtf8 = buffer.toString('utf8');
    return asUtf8.length > 0 || buffer.length === 0;
  } catch {
    return false;
  }
}

export async function detectFileType(buffer: Buffer): Promise<FileType | null> {
  if (await validateMagicBytes(buffer, 'pdf')) return 'pdf';
  if (await validateMagicBytes(buffer, 'docx')) return 'docx';
  if (await validateMagicBytes(buffer, 'txt')) return 'txt';
  return null;
}

