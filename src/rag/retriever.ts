import { VectorStore } from './vector.store.js';

export class RAGRetriever {
  private readonly vectorStore = new VectorStore();

  public async retrieveRelevantContext(userId: string, userMessage: string): Promise<string> {
    const chunks = await this.vectorStore.searchSimilar(userId, userMessage, 5);
    if (chunks.length === 0) return '';
    return chunks
      .map((chunk) => `From ${chunk.sourceType}: ${chunk.chunkText.slice(0, 400)}`)
      .join('\n');
  }
}

