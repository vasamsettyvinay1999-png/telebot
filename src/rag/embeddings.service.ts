import { ClaudeClient } from '../services/ai/claude.client.js';

export class EmbeddingsService {
  private readonly client = new ClaudeClient();

  // Placeholder embedding generator until dedicated embedding endpoint is wired.
  public embedDocument(text: string): number[] {
    void this.client;
    return this.hashToVector(text);
  }

  public embedQuery(query: string): number[] {
    return this.hashToVector(query);
  }

  private hashToVector(input: string): number[] {
    const vector = new Array<number>(32).fill(0);
    for (let i = 0; i < input.length; i += 1) {
      const idx = i % 32;
      vector[idx] = (vector[idx] ?? 0) + input.charCodeAt(i) / 255;
    }
    return vector;
  }
}

