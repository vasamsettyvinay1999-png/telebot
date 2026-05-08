import { queues } from '../queue.registry.js';

export interface FileProcessingJobData {
  userId: string;
  telegramId: number;
  resumeId: string;
  storagePath: string;
  fileType: 'pdf' | 'docx' | 'txt';
}

export async function enqueueFileProcessingJob(data: FileProcessingJobData): Promise<void> {
  if (!queues.fileProcessing) {
    throw new Error('File processing queue is not available');
  }
  await queues.fileProcessing.add('process-upload', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
}

