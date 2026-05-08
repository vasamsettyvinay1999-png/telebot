import type { FastifyInstance } from 'fastify';
import { queues } from '../queues/queue.registry.js';
import { supabase } from '../config/supabase.js';

export function registerAdminRoutes(fastify: FastifyInstance): void {
  fastify.get('/admin/health', () => ({ status: 'ok' }));

  fastify.get('/admin/leads', async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('id,name,email,status,lead_score,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return { leads: data ?? [] };
  });

  fastify.get('/admin/queue', async () => {
    if (!queues.fileProcessing) {
      return { enabled: false };
    }
    const [waiting, active, failed] = await Promise.all([
      queues.fileProcessing.getWaitingCount(),
      queues.fileProcessing.getActiveCount(),
      queues.fileProcessing.getFailedCount(),
    ]);
    return { enabled: true, file_processing: { waiting, active, failed } };
  });
}

