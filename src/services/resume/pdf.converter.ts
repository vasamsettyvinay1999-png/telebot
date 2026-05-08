import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class PdfConverter {
  public async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orion-pdf-'));
    const docxPath = path.join(workDir, 'resume.docx');
    const pdfPath = path.join(workDir, 'resume.pdf');
    await fs.writeFile(docxPath, docxBuffer);
    await execFileAsync(
      'soffice',
      ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', workDir, docxPath],
      { timeout: 30000, env: { ...process.env, HOME: os.tmpdir() } },
    );
    const pdf = await fs.readFile(pdfPath);
    await fs.rm(workDir, { recursive: true, force: true });
    return pdf;
  }
}

