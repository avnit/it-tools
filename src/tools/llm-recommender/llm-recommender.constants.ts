import type { LlmModel, TaskProfile } from './llm-recommender.types';

// Anthropic prices are the first-party API rates; Google prices are the standard paid-tier rates.
// Both move, so the UI shows this date and links out for confirmation.
export const CATALOG_UPDATED_AT = '2026-06-24';

export const models: LlmModel[] = [
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'Anthropic',
    contextWindow: 1_000_000,
    inputPricePerMTok: 5,
    outputPricePerMTok: 25,
    modalities: ['text', 'image', 'pdf'],
    ratings: { reasoning: 5, coding: 5, agentic: 5, longContext: 5, speed: 3, structuredOutput: 5 },
    notes: 'Default choice for hard reasoning and long-horizon agent work. Adaptive thinking is on by default; use output_config.effort to trade depth against spend.',
    docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
  },
  {
    id: 'claude-fable-5-1',
    name: 'Claude Fable 5.1',
    provider: 'Anthropic',
    contextWindow: 1_000_000,
    inputPricePerMTok: 10,
    outputPricePerMTok: 50,
    modalities: ['text', 'image', 'pdf'],
    ratings: { reasoning: 5, coding: 5, agentic: 5, longContext: 5, speed: 2, structuredOutput: 5 },
    notes: 'Most capable widely released Anthropic model, for the most demanding reasoning. Thinking is always on and forced tool choice is rejected, so plan for longer turns.',
    docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'Anthropic',
    contextWindow: 1_000_000,
    inputPricePerMTok: 2,
    outputPricePerMTok: 10,
    modalities: ['text', 'image', 'pdf'],
    ratings: { reasoning: 4, coding: 4, agentic: 4, longContext: 5, speed: 4, structuredOutput: 5 },
    notes: 'The workhorse tier: most of the Opus capability at a fraction of the price, with the same 1M context window.',
    docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
  },
  {
    id: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    contextWindow: 200_000,
    inputPricePerMTok: 1,
    outputPricePerMTok: 5,
    modalities: ['text', 'image'],
    ratings: { reasoning: 3, coding: 3, agentic: 3, longContext: 3, speed: 5, structuredOutput: 4 },
    notes: 'Cheapest and fastest Claude. Good for classification, routing and sub-agent workers. Still uses budget_tokens rather than adaptive thinking.',
    docsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    contextWindow: 1_048_576,
    inputPricePerMTok: 1.25,
    outputPricePerMTok: 10,
    modalities: ['text', 'image', 'pdf', 'audio', 'video'],
    ratings: { reasoning: 5, coding: 4, agentic: 4, longContext: 5, speed: 3, structuredOutput: 4 },
    notes: 'Strongest Gemini tier, and the broadest native modality support in this catalog: audio and video go in directly.',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    contextWindow: 1_048_576,
    inputPricePerMTok: 0.3,
    outputPricePerMTok: 2.5,
    modalities: ['text', 'image', 'pdf', 'audio', 'video'],
    ratings: { reasoning: 4, coding: 3, agentic: 3, longContext: 5, speed: 5, structuredOutput: 4 },
    notes: 'Very cheap for a 1M-context multimodal model. A strong default for high-volume pipelines that still need decent reasoning.',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash-Lite',
    provider: 'Google',
    contextWindow: 1_048_576,
    inputPricePerMTok: 0.1,
    outputPricePerMTok: 0.4,
    modalities: ['text', 'image', 'pdf'],
    ratings: { reasoning: 2, coding: 2, agentic: 2, longContext: 4, speed: 5, structuredOutput: 3 },
    notes: 'The cheapest option here by a wide margin. Built for bulk classification, tagging and extraction, not for reasoning.',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/models',
  },
];

export const taskProfiles: TaskProfile[] = [
  {
    id: 'agentic-coding',
    label: 'Agentic coding (multi-step, tool-using)',
    weights: { coding: 5, agentic: 5, reasoning: 4, longContext: 3, structuredOutput: 2, speed: 1 },
    guidance: 'Long-horizon coding rewards the strongest model at high effort: a cheaper model that needs more turns is rarely cheaper per finished task.',
  },
  {
    id: 'code-review',
    label: 'Code review and refactoring',
    weights: { coding: 5, reasoning: 4, longContext: 3, structuredOutput: 2, agentic: 1, speed: 1 },
    guidance: 'Review quality tracks reasoning closely. Cache the repository context so repeated reviews only pay for the diff.',
  },
  {
    id: 'long-document-analysis',
    label: 'Long document or codebase analysis',
    weights: { longContext: 5, reasoning: 4, structuredOutput: 2, coding: 1, speed: 1, agentic: 1 },
    guidance: 'Check the context window first, then price: input tokens dominate the bill here, so prompt caching is the largest single lever.',
  },
  {
    id: 'research-synthesis',
    label: 'Research and synthesis',
    weights: { reasoning: 5, longContext: 4, agentic: 3, structuredOutput: 2, speed: 1, coding: 1 },
    guidance: 'Fan-out research suits a strong orchestrator with cheaper worker models doing the reading.',
  },
  {
    id: 'high-volume-classification',
    label: 'High-volume classification or routing',
    weights: { speed: 5, structuredOutput: 5, reasoning: 2, longContext: 1, coding: 1, agentic: 1 },
    guidance: 'Per-request cost and latency dominate. Use the smallest model that clears your accuracy bar, and batch the work where latency allows.',
  },
  {
    id: 'data-extraction',
    label: 'Structured data extraction',
    weights: { structuredOutput: 5, reasoning: 3, longContext: 3, speed: 3, coding: 1, agentic: 1 },
    guidance: 'Use strict schemas rather than prompt instructions, so the cheaper tiers stay viable.',
  },
  {
    id: 'summarization',
    label: 'Summarization',
    weights: { longContext: 4, reasoning: 3, speed: 3, structuredOutput: 2, coding: 1, agentic: 1 },
    guidance: 'Output tokens are small relative to input, so weigh input price and context window most heavily.',
  },
  {
    id: 'chat-support',
    label: 'Chat, Q&A or customer support',
    weights: { speed: 4, reasoning: 3, structuredOutput: 3, longContext: 2, agentic: 2, coding: 1 },
    guidance: 'Latency is felt directly by the user. Cache the system prompt and knowledge base to keep both cost and time-to-first-token down.',
  },
  {
    id: 'creative-writing',
    label: 'Creative and long-form writing',
    weights: { reasoning: 4, longContext: 3, structuredOutput: 1, speed: 2, coding: 1, agentic: 1 },
    guidance: 'Output tokens dominate the bill, so compare output prices rather than input prices.',
  },
  {
    id: 'multimodal-analysis',
    label: 'Image, audio or video analysis',
    weights: { reasoning: 4, longContext: 3, structuredOutput: 3, speed: 2, coding: 1, agentic: 1 },
    guidance: 'Filter on the modality you actually need: only the Gemini tiers here take audio and video natively.',
  },
];

export const priorities = [
  { id: 'quality', label: 'Best possible quality', costWeight: 0.05, speedWeight: 0.05 },
  { id: 'balanced', label: 'Balanced', costWeight: 0.2, speedWeight: 0.1 },
  { id: 'cost', label: 'Lowest cost', costWeight: 0.45, speedWeight: 0.05 },
  { id: 'latency', label: 'Lowest latency', costWeight: 0.1, speedWeight: 0.35 },
] as const;

export const modalityOptions = [
  { label: 'Text only', value: 'text' },
  { label: 'Images', value: 'image' },
  { label: 'PDFs', value: 'pdf' },
  { label: 'Audio', value: 'audio' },
  { label: 'Video', value: 'video' },
] as const;
