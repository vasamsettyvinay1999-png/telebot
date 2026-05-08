import { IntentClassifier } from './intent.classifier.js';
import { MemoryService } from './memory.service.js';

export interface AIContext {
  intent: string;
  summary: string | null;
  recentMessages: Array<{ role: string; content: string; timestamp: number }>;
}

export class AIOrchestrator {
  private readonly classifier = new IntentClassifier();
  private readonly memory = new MemoryService();

  public async assembleContext(userId: string, message: string): Promise<AIContext> {
    const [summary, recentMessages] = await Promise.all([
      this.memory.getSummary(userId),
      this.memory.getRecentMessages(userId),
    ]);
    return {
      intent: this.classifier.classify(message),
      summary,
      recentMessages,
    };
  }
}

