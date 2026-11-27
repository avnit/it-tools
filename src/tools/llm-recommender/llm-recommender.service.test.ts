import { describe, expect, it } from 'vitest';
import {
  computeFitScore,
  costPerRequest,
  formatCost,
  getPriority,
  getTaskProfile,
  recommendModels,
} from './llm-recommender.service';
import { models } from './llm-recommender.constants';
import type { RecommendationInput } from './llm-recommender.types';

const baseInput: RecommendationInput = {
  taskId: 'agentic-coding',
  priority: 'balanced',
  requiredModalities: [],
  minContextWindow: 0,
  providers: [],
  inputTokensPerRequest: 10_000,
  outputTokensPerRequest: 1_000,
  requestsPerMonth: 10_000,
};

function modelById(id: string) {
  const model = models.find(candidate => candidate.id === id);

  if (!model) {
    throw new Error(`Missing fixture model ${id}`);
  }

  return model;
}

describe('llm-recommender', () => {
  describe('costPerRequest', () => {
    it('sums the input and output token cost', () => {
      const cost = costPerRequest({
        model: modelById('claude-opus-5'),
        inputTokensPerRequest: 1_000_000,
        outputTokensPerRequest: 1_000_000,
      });

      expect(cost).toBeCloseTo(30, 5);
    });

    it('returns zero for an empty request', () => {
      expect(costPerRequest({ model: modelById('claude-opus-5'), inputTokensPerRequest: 0, outputTokensPerRequest: 0 })).toBe(0);
    });
  });

  describe('computeFitScore', () => {
    it('returns 1 when every weighted dimension is maxed out', () => {
      expect(computeFitScore({ model: modelById('claude-opus-5'), weights: { coding: 3, reasoning: 2 } })).toBe(1);
    });

    it('returns 0 when there are no weights', () => {
      expect(computeFitScore({ model: modelById('claude-opus-5'), weights: {} })).toBe(0);
    });

    it('weights dimensions rather than averaging them', () => {
      const haiku = modelById('claude-haiku-4-5');

      const speedHeavy = computeFitScore({ model: haiku, weights: { speed: 5, reasoning: 1 } });
      const reasoningHeavy = computeFitScore({ model: haiku, weights: { speed: 1, reasoning: 5 } });

      expect(speedHeavy).toBeGreaterThan(reasoningHeavy);
    });
  });

  describe('formatCost', () => {
    it('formats across magnitudes', () => {
      expect(formatCost(0)).toBe('$0');
      expect(formatCost(0.0012)).toBe('$0.0012');
      expect(formatCost(12.5)).toBe('$12.50');
      expect(formatCost(1234.6)).toBe('$1,235');
    });
  });

  describe('recommendModels', () => {
    it('ranks a top-tier model first for agentic coding at quality priority', () => {
      const { recommendations } = recommendModels({ ...baseInput, priority: 'quality' });

      expect(['claude-opus-5', 'claude-fable-5-1']).toContain(recommendations[0].model.id);
    });

    it('prefers a cheap model for high-volume classification at cost priority', () => {
      const { recommendations } = recommendModels({
        ...baseInput,
        taskId: 'high-volume-classification',
        priority: 'cost',
      });

      expect(recommendations[0].model.id).toBe('gemini-2.5-flash-lite');
    });

    it('excludes models whose context window is too small', () => {
      const { recommendations, excluded } = recommendModels({ ...baseInput, minContextWindow: 500_000 });

      expect(recommendations.every(({ model }) => model.contextWindow >= 500_000)).toBe(true);
      expect(excluded.map(({ model }) => model.id)).toContain('claude-haiku-4-5');
    });

    it('excludes models that cannot take the required modality', () => {
      const { recommendations, excluded } = recommendModels({ ...baseInput, requiredModalities: ['video'] });

      expect(recommendations.every(({ model }) => model.provider === 'Google')).toBe(true);
      expect(excluded.some(({ reason }) => reason.includes('video'))).toBe(true);
    });

    it('honours a provider filter', () => {
      const { recommendations } = recommendModels({ ...baseInput, providers: ['Anthropic'] });

      expect(recommendations.every(({ model }) => model.provider === 'Anthropic')).toBe(true);
    });

    it('returns no recommendation when the filters cannot be satisfied', () => {
      const { recommendations, excluded } = recommendModels({
        ...baseInput,
        providers: ['Anthropic'],
        requiredModalities: ['video'],
      });

      expect(recommendations).toEqual([]);
      expect(excluded.length).toBeGreaterThan(0);
    });

    it('scales the monthly cost with the request volume', () => {
      const [single] = recommendModels({ ...baseInput, requestsPerMonth: 1 }).recommendations;
      const matching = recommendModels({ ...baseInput, requestsPerMonth: 1_000 })
        .recommendations
        .find(({ model }) => model.id === single.model.id);

      expect(matching?.monthlyCost).toBeCloseTo(single.monthlyCost * 1_000, 5);
    });

    it('attaches the task guidance and per-model reasons', () => {
      const { recommendations, guidance } = recommendModels(baseInput);

      expect(guidance).toBe(getTaskProfile('agentic-coding').guidance);
      expect(recommendations[0].reasons.length).toBeGreaterThan(0);
    });
  });

  describe('lookups', () => {
    it('throws on an unknown task', () => {
      expect(() => getTaskProfile('nope')).toThrow('Unknown task profile: nope');
    });

    it('throws on an unknown priority', () => {
      expect(() => getPriority('nope' as never)).toThrow('Unknown priority: nope');
    });
  });
});
