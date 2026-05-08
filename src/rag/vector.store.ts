import { supabase } from '../config/supabase.js';
import { EmbeddingsService } from './embeddings.service.js';

export interface TextChunk {
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
}

export interface SimilarChunk {
  chunkText: string;
  sourceType: string;
  score: number;
}

export class VectorStore {
  private readonly embeddings = new EmbeddingsService();

  public async upsertChunks(
    userId: string,
    sourceId: string,
    sourceType: string,
    chunks: TextChunk[],
  ): Promise<void> {
    const payload = chunks.map((chunk) => ({
      user_id: userId,
      source_id: sourceId,
      source_type: sourceType,
      chunk_index: chunk.chunkIndex,
      chunk_text: chunk.chunkText,
      embedding: chunk.embedding,
    }));
    const { error } = await supabase.from('document_embeddings').insert(payload);
    if (error) throw error;
  }

  public async searchSimilar(userId: string, query: string, topK: number): Promise<SimilarChunk[]> {
    const queryEmbedding = this.embeddings.embedQuery(query);
    const { data, error } = await supabase
      .from('document_embeddings')
      .select('chunk_text,source_type,embedding')
      .eq('user_id', userId)
      .limit(Math.max(topK * 8, 50));
    if (error) throw error;
    const scored = (data ?? [])
      .map((row) => {
        const embedding = Array.isArray(row.embedding)
          ? (row.embedding as unknown[]).map((v) => (typeof v === 'number' ? v : Number(v) || 0))
          : [];
        return {
          chunkText: (row.chunk_text as string) ?? '',
          sourceType: (row.source_type as string) ?? 'unknown',
          score: this.cosineSimilarity(queryEmbedding, embedding),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    return scored;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    if (len === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < len; i += 1) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      dot += av * bv;
      normA += av * av;
      normB += bv * bv;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

