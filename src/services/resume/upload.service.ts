import { randomUUID } from 'node:crypto';
import { MAX_FILE_SIZE_BYTES } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';
import { enqueueFileProcessingJob } from '../../queues/jobs/file.jobs.js';
import { detectFileType } from '../../utils/fileValidator.js';
import { logger } from '../../utils/logger.js';

export interface UploadResumeResult {
  resumeId: string;
  fileType: 'pdf' | 'docx' | 'txt';
}

export async function handleResumeUpload(
  userId: string,
  telegramId: number,
  telegramFileId: string,
  fileSizeBytes: number | undefined,
): Promise<UploadResumeResult> {
  if (typeof fileSizeBytes === 'number' && fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds 20MB limit. Please compress and re-upload.');
  }

  const fileLinkResponse = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${telegramFileId}`,
  );
  const fileLinkJson = (await fileLinkResponse.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  const filePath = fileLinkJson.result?.file_path;
  if (!fileLinkJson.ok || !filePath) {
    throw new Error('Failed to fetch Telegram file metadata.');
  }

  const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error('Failed to download file from Telegram.');
  }
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds 20MB limit after download.');
  }

  const fileType = await detectFileType(buffer);
  if (!fileType || !['pdf', 'docx', 'txt'].includes(fileType)) {
    throw new Error('Unsupported file type. Please upload PDF, DOCX, or TXT.');
  }

  const extension = fileType === 'txt' ? 'txt' : fileType;
  const resumeId = randomUUID();
  const storagePath = `raw/${userId}/${resumeId}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(storagePath, buffer, { contentType: 'application/octet-stream', upsert: false });
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from('resumes').insert({
    id: resumeId,
    user_id: userId,
    name: `Resume ${new Date().toISOString()}`,
    storage_path: storagePath,
    file_type: fileType,
    file_size_bytes: buffer.length,
    is_active: false,
    status: 'processing',
  });
  if (dbError) throw dbError;

  await enqueueFileProcessingJob({
    userId,
    telegramId,
    resumeId,
    storagePath,
    fileType,
  }).catch((error: unknown) => {
    logger.error({ err: error, resumeId }, 'Failed to enqueue file processing job');
    throw error;
  });

  return { resumeId, fileType };
}

