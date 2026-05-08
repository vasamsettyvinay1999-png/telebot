import fs from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'bullmq';
import { supabase } from '../../config/supabase.js';
import { EmbeddingsService } from '../../rag/embeddings.service.js';
import { VectorStore } from '../../rag/vector.store.js';
import { ResumeParserService } from '../../services/resume/parser.service.js';
import { ATSAnalyzer } from '../../services/resume/ats.analyzer.js';
import { logger } from '../../utils/logger.js';
import type { FileProcessingJobData } from '../jobs/file.jobs.js';
import { QUEUE_NAMES } from '../queue.registry.js';
import { createBullRedisConnection } from '../redis.connection.js';

const parser = new ResumeParserService();
const ats = new ATSAnalyzer();
const embeddings = new EmbeddingsService();
const vectorStore = new VectorStore();

function chunkText(text: string, size = 512, overlap = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + size).join(' '));
    if (i + size >= words.length) break;
    i += size - overlap;
  }
  return chunks.filter(Boolean);
}

async function processFileJob(data: FileProcessingJobData): Promise<void> {
  const tempPath = path.join(process.cwd(), 'tmp', `${data.resumeId}.${data.fileType}`);
  await fs.mkdir(path.dirname(tempPath), { recursive: true });

  const { data: objectData, error: downloadError } = await supabase.storage
    .from('resumes')
    .download(data.storagePath);
  if (downloadError) throw downloadError;
  const buffer = Buffer.from(await objectData.arrayBuffer());
  await fs.writeFile(tempPath, buffer);

  const extracted = await parser.extractText(tempPath, data.fileType);
  const sanitized = parser.sanitizeText(extracted);
  const parsed = parser.parseToStructured(sanitized);
  const preScan = ats.quickPreScan(sanitized);

  const chunks = chunkText(sanitized);
  const vectorChunks = chunks.map((chunkTextValue, index) => ({
    chunkIndex: index,
    chunkText: chunkTextValue,
    embedding: embeddings.embedDocument(chunkTextValue),
  }));
  await vectorStore.upsertChunks(data.userId, data.resumeId, 'resume', vectorChunks);

  const { error: updateError } = await supabase
    .from('resumes')
    .update({
      raw_text: sanitized,
      parsed_sections: parsed,
      ats_score: preScan.score,
      status: 'active',
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.resumeId);
  if (updateError) throw updateError;

  await fs.unlink(tempPath).catch(() => undefined);
}

export function startFileWorker(): Worker<FileProcessingJobData> | null {
  const connection = createBullRedisConnection();
  if (!connection) return null;
  const worker = new Worker<FileProcessingJobData>(
    QUEUE_NAMES.FILE_PROCESSING,
    async (job) => {
      await job.updateProgress(10);
      await processFileJob(job.data);
      await job.updateProgress(100);
    },
    {
      connection,
      concurrency: 10,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error(
      { err: error, jobId: job?.id, data: job?.data },
      'File processing job failed',
    );
  });

  return worker;
}

