import { models, priorities, taskProfiles } from './llm-recommender.constants';
import type {
  LlmModel,
  Modality,
  PriorityId,
  Ratings,
  Recommendation,
  RecommendationInput,
  RecommendationResult,
  TaskProfile,
} from './llm-recommender.types';

export function getTaskProfile(taskId: string): TaskProfile {
  const profile = taskProfiles.find(task => task.id === taskId);

  if (!profile) {
    throw new Error(`Unknown task profile: ${taskId}`);
  }

  return profile;
}

export function getPriority(priorityId: PriorityId) {
  const priority = priorities.find(candidate => candidate.id === priorityId);

  if (!priority) {
    throw new Error(`Unknown priority: ${priorityId}`);
  }

  return priority;
}

export function costPerRequest({
  model,
  inputTokensPerRequest,
  outputTokensPerRequest,
}: {
  model: LlmModel
  inputTokensPerRequest: number
  outputTokensPerRequest: number
}) {
  const inputCost = (inputTokensPerRequest / 1_000_000) * model.inputPricePerMTok;
  const outputCost = (outputTokensPerRequest / 1_000_000) * model.outputPricePerMTok;

  return inputCost + outputCost;
}

// How well a model matches the task's weighted capability profile, on a 0-1 scale.
export function computeFitScore({ model, weights }: { model: LlmModel; weights: Partial<Ratings> }) {
  const entries = Object.entries(weights) as [keyof Ratings, number][];
  const totalWeight = entries.reduce((total, [, weight]) => total + weight, 0);

  if (totalWeight === 0) {
    return 0;
  }

  const weighted = entries.reduce((total, [dimension, weight]) => total + weight * (model.ratings[dimension] / 5), 0);

  return weighted / totalWeight;
}

function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) {
    return `${Math.round(tokens / 100_000) / 10}M`;
  }

  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}K`;
  }

  return String(tokens);
}

export function formatCost(amount: number) {
  if (amount === 0) {
    return '$0';
  }

  if (amount < 0.01) {
    return `$${amount.toFixed(4)}`;
  }

  if (amount < 100) {
    return `$${amount.toFixed(2)}`;
  }

  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function buildReasons({
  model,
  profile,
  input,
  rank,
  cheapestCost,
}: {
  model: LlmModel
  profile: TaskProfile
  input: RecommendationInput
  rank: number
  cheapestCost: number
}) {
  const reasons: string[] = [];

  // Call out the two capabilities the task weighs most, when the model actually scores well on them.
  const topDimensions = (Object.entries(profile.weights) as [keyof Ratings, number][])
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .filter(([dimension]) => model.ratings[dimension] >= 4);

  const dimensionLabels: Record<keyof Ratings, string> = {
    reasoning: 'reasoning',
    coding: 'coding',
    agentic: 'agentic tool use',
    longContext: 'long-context handling',
    speed: 'throughput',
    structuredOutput: 'structured output',
  };

  if (topDimensions.length > 0) {
    reasons.push(`Rates highly on ${topDimensions.map(([dimension]) => dimensionLabels[dimension]).join(' and ')}, which this task weighs most.`);
  }

  reasons.push(`${formatTokens(model.contextWindow)} context window, ${formatCost(model.inputPricePerMTok)} in / ${formatCost(model.outputPricePerMTok)} out per million tokens.`);

  const cost = costPerRequest({
    model,
    inputTokensPerRequest: input.inputTokensPerRequest,
    outputTokensPerRequest: input.outputTokensPerRequest,
  });

  if (cheapestCost > 0 && cost > cheapestCost * 1.5) {
    reasons.push(`Costs about ${Math.round((cost / cheapestCost) * 10) / 10}x the cheapest qualifying model at your volume.`);
  }
  else if (rank === 0) {
    reasons.push('Also among the cheapest models that clear your requirements.');
  }

  reasons.push(model.notes);

  return reasons;
}

export function recommendModels(input: RecommendationInput): RecommendationResult {
  const profile = getTaskProfile(input.taskId);
  const priority = getPriority(input.priority);

  const excluded: { model: LlmModel; reason: string }[] = [];

  const candidates = models.filter((model) => {
    if (input.providers.length > 0 && !input.providers.includes(model.provider)) {
      excluded.push({ model, reason: `Provider ${model.provider} is filtered out.` });
      return false;
    }

    if (model.contextWindow < input.minContextWindow) {
      excluded.push({ model, reason: `Context window of ${formatTokens(model.contextWindow)} is below the required ${formatTokens(input.minContextWindow)}.` });
      return false;
    }

    const missing = input.requiredModalities.filter((modality: Modality) => !model.modalities.includes(modality));

    if (missing.length > 0) {
      excluded.push({ model, reason: `Does not accept ${missing.join(', ')} input.` });
      return false;
    }

    return true;
  });

  if (candidates.length === 0) {
    return { recommendations: [], excluded, guidance: profile.guidance };
  }

  const costs = candidates.map(model => costPerRequest({
    model,
    inputTokensPerRequest: input.inputTokensPerRequest,
    outputTokensPerRequest: input.outputTokensPerRequest,
  }));

  const cheapestCost = Math.min(...costs);
  const capabilityWeight = 1 - priority.costWeight - priority.speedWeight;

  const scored = candidates.map((model, index) => {
    const fitScore = computeFitScore({ model, weights: profile.weights });
    // Relative to the cheapest qualifying model, so the scale adapts to the shortlist.
    const costScore = cheapestCost === 0 ? 1 : cheapestCost / costs[index];
    const speedScore = model.ratings.speed / 5;

    return {
      model,
      fitScore,
      costScore,
      speedScore,
      costPerRequest: costs[index],
      monthlyCost: costs[index] * input.requestsPerMonth,
      score: fitScore * capabilityWeight + costScore * priority.costWeight + speedScore * priority.speedWeight,
      reasons: [] as string[],
    };
  });

  const recommendations: Recommendation[] = scored
    .sort((a, b) => b.score - a.score)
    .map((recommendation, rank) => ({
      ...recommendation,
      reasons: buildReasons({ model: recommendation.model, profile, input, rank, cheapestCost }),
    }));

  return { recommendations, excluded, guidance: profile.guidance };
}
