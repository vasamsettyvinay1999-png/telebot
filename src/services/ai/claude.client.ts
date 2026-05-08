import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';
import { logger } from '../../utils/logger.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export class ClaudeClient {
  public async complete(
    system: string,
    user: string,
    options?: { maxTokens?: number; userId?: string; feature?: string },
  ): Promise<string> {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens ?? 1500,
      system,
      messages: [{ role: 'user', content: user }],
    });
    void this.recordUsage(response, options?.userId, options?.feature);
    const first = response.content[0];
    if (!first || first.type !== 'text') return '';
    return first.text;
  }

  private async recordUsage(
    response: Awaited<ReturnType<typeof anthropic.messages.create>>,
    userId?: string,
    feature?: string,
  ): Promise<void> {
    try {
      const usage = this.extractUsage(response);
      const inputTokens =
        typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0;
      const outputTokens =
        typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0;
      // Conservative rough estimate for Sonnet-like pricing.
      const estimatedCostUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
      await supabase.from('ai_usage_events').insert({
        user_id: userId ?? null,
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost_usd: Number(estimatedCostUsd.toFixed(6)),
        feature: feature ?? null,
      });
    } catch (error) {
      logger.warn({ err: error }, 'Failed to record AI usage event');
    }
  }

  private extractUsage(
    response: Awaited<ReturnType<typeof anthropic.messages.create>>,
  ): { input_tokens?: number; output_tokens?: number } | null {
    if (response && typeof response === 'object' && 'usage' in response) {
      const usage = (response as { usage?: unknown }).usage;
      if (usage && typeof usage === 'object') {
        const maybe = usage as { input_tokens?: unknown; output_tokens?: unknown };
        return {
          input_tokens: typeof maybe.input_tokens === 'number' ? maybe.input_tokens : 0,
          output_tokens: typeof maybe.output_tokens === 'number' ? maybe.output_tokens : 0,
        };
      }
    }
    return null;
  }
}

