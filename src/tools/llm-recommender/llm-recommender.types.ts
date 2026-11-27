export type Modality = 'text' | 'image' | 'pdf' | 'audio' | 'video';

export type RatingDimension =
  | 'reasoning'
  | 'coding'
  | 'agentic'
  | 'longContext'
  | 'speed'
  | 'structuredOutput';

export type Ratings = Record<RatingDimension, number>;

export interface LlmModel {
  id: string
  name: string
  provider: 'Anthropic' | 'Google'
  contextWindow: number
  inputPricePerMTok: number
  outputPricePerMTok: number
  modalities: Modality[]
  ratings: Ratings
  notes: string
  docsUrl: string
}

export interface TaskProfile {
  id: string
  label: string
  weights: Partial<Ratings>
  guidance: string
}

export type PriorityId = 'quality' | 'balanced' | 'cost' | 'latency';

export interface RecommendationInput {
  taskId: string
  priority: PriorityId
  requiredModalities: Modality[]
  minContextWindow: number
  providers: ('Anthropic' | 'Google')[]
  inputTokensPerRequest: number
  outputTokensPerRequest: number
  requestsPerMonth: number
}

export interface Recommendation {
  model: LlmModel
  score: number
  fitScore: number
  costScore: number
  speedScore: number
  monthlyCost: number
  costPerRequest: number
  reasons: string[]
}

export interface RecommendationResult {
  recommendations: Recommendation[]
  excluded: { model: LlmModel; reason: string }[]
  guidance: string
}
