import { EmbeddingsService } from '../../rag/embeddings.service.js';

export interface EscalationDecision {
  shouldEscalate: boolean;
  reason: string | null;
  urgency: 'low' | 'medium' | 'high';
  similarityScore?: number;
}

const humanSignals = [/human/i, /agent/i, /real person/i, /manager/i];
const billingSignals = [/payment/i, /billing/i, /charged/i, /refund/i];
const distressSignals = [/depressed/i, /panic/i, /can't pay rent/i, /emergency/i];

export class EscalationDetector {
  private readonly embeddings = new EmbeddingsService();

  public detect(message: string, consecutiveErrors: number): EscalationDecision {
    if (consecutiveErrors >= 3) {
      return { shouldEscalate: true, reason: 'consecutive_errors', urgency: 'high' };
    }
    if (distressSignals.some((r) => r.test(message))) {
      return { shouldEscalate: true, reason: 'distress', urgency: 'high' };
    }
    if (billingSignals.some((r) => r.test(message))) {
      return { shouldEscalate: true, reason: 'billing', urgency: 'medium' };
    }
    if (humanSignals.some((r) => r.test(message))) {
      return { shouldEscalate: true, reason: 'human_requested', urgency: 'medium' };
    }
    return { shouldEscalate: false, reason: null, urgency: 'low' };
  }

  public detectWithContext(
    message: string,
    consecutiveErrors: number,
    priorUserMessages: string[],
  ): EscalationDecision {
    const base = this.detect(message, consecutiveErrors);
    if (base.shouldEscalate) return base;
    if (priorUserMessages.length < 2) return base;

    const query = this.embeddings.embedQuery(message);
    const maxSimilarity = priorUserMessages
      .slice(-6)
      .map((m) => this.cosineSimilarity(query, this.embeddings.embedDocument(m)))
      .reduce((acc, score) => Math.max(acc, score), 0);

    // Treat very high similarity repeated user attempts as loop frustration.
    if (maxSimilarity >= 0.96) {
      return {
        shouldEscalate: true,
        reason: 'semantic_loop_detected',
        urgency: 'medium',
        similarityScore: Number(maxSimilarity.toFixed(3)),
      };
    }
    return { ...base, similarityScore: Number(maxSimilarity.toFixed(3)) };
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

