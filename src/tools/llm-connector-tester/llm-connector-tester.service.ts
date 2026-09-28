export type ProviderId = 'anthropic' | 'gemini' | 'openai-compatible';

export interface ProviderDefinition {
  id: ProviderId
  label: string
  defaultBaseUrl: string
  defaultModel: string
  modelSuggestions: string[]
  keyLabel: string
  keyPlaceholder: string
  notes: string
}

export const providers: ProviderDefinition[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5',
    modelSuggestions: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
    keyLabel: 'API key (x-api-key)',
    keyPlaceholder: 'sk-ant-...',
    notes: 'Browser calls need the anthropic-dangerous-direct-browser-access header, which this tool sends for you.',
  },
  {
    id: 'gemini',
    label: 'Google (Gemini)',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-pro',
    modelSuggestions: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
    keyLabel: 'API key (x-goog-api-key)',
    keyPlaceholder: 'AIza...',
    notes: 'The key is sent as a header rather than a query string so it does not end up in proxy or browser logs.',
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible endpoint',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: '',
    modelSuggestions: [],
    keyLabel: 'API key (Bearer)',
    keyPlaceholder: 'sk-...',
    notes: 'Use this for self-hosted gateways, Ollama, vLLM, LiteLLM or any other /chat/completions endpoint.',
  },
];

export function getProvider(id: ProviderId) {
  const provider = providers.find(candidate => candidate.id === id);

  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }

  return provider;
}

export interface ConnectorRequestInput {
  provider: ProviderId
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  systemPrompt?: string
  maxTokens?: number
}

export interface PreparedRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function trimTrailingSlash(url: string) {
  return url.trim().replace(/\/+$/, '');
}

export function buildRequest({
  provider,
  baseUrl,
  apiKey,
  model,
  prompt,
  systemPrompt = '',
  maxTokens = 1024,
}: ConnectorRequestInput): PreparedRequest {
  const root = trimTrailingSlash(baseUrl);
  const system = systemPrompt.trim();

  if (provider === 'anthropic') {
    return {
      url: `${root}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Without this opt-in the API rejects requests that carry a browser Origin header.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model,
        max_tokens: maxTokens,
        ...(system === '' ? {} : { system }),
        messages: [{ role: 'user', content: prompt }],
      },
    };
  }

  if (provider === 'gemini') {
    return {
      url: `${root}/v1beta/models/${model}:generateContent`,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(system === '' ? {} : { systemInstruction: { parts: [{ text: system }] } }),
        generationConfig: { maxOutputTokens: maxTokens },
      },
    };
  }

  return {
    url: `${root}/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: {
      model,
      max_tokens: maxTokens,
      messages: [
        ...(system === '' ? [] : [{ role: 'system', content: system }]),
        { role: 'user', content: prompt },
      ],
    },
  };
}

export interface ConnectorUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export interface ParsedResponse {
  text: string
  model?: string
  stopReason?: string
  usage: ConnectorUsage
}

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : undefined;
}

export function parseResponse({ provider, payload }: { provider: ProviderId; payload: unknown }): ParsedResponse {
  const data = (payload ?? {}) as Record<string, any>;

  if (provider === 'anthropic') {
    const text = (Array.isArray(data.content) ? data.content : [])
      .filter((block: any) => block?.type === 'text')
      .map((block: any) => block.text)
      .join('');

    return {
      text,
      model: data.model,
      stopReason: data.stop_reason,
      usage: {
        inputTokens: asNumber(data.usage?.input_tokens),
        outputTokens: asNumber(data.usage?.output_tokens),
      },
    };
  }

  if (provider === 'gemini') {
    const candidate = (Array.isArray(data.candidates) ? data.candidates : [])[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part: any) => part?.text ?? '')
      .join('');

    return {
      text,
      model: data.modelVersion,
      stopReason: candidate?.finishReason,
      usage: {
        inputTokens: asNumber(data.usageMetadata?.promptTokenCount),
        outputTokens: asNumber(data.usageMetadata?.candidatesTokenCount),
        totalTokens: asNumber(data.usageMetadata?.totalTokenCount),
      },
    };
  }

  const choice = (Array.isArray(data.choices) ? data.choices : [])[0];

  return {
    text: choice?.message?.content ?? '',
    model: data.model,
    stopReason: choice?.finish_reason,
    usage: {
      inputTokens: asNumber(data.usage?.prompt_tokens),
      outputTokens: asNumber(data.usage?.completion_tokens),
      totalTokens: asNumber(data.usage?.total_tokens),
    },
  };
}

export function extractApiErrorMessage({ provider, payload }: { provider: ProviderId; payload: unknown }): string | undefined {
  const data = (payload ?? {}) as Record<string, any>;

  if (provider === 'anthropic') {
    return data.error?.message;
  }

  // Gemini and the OpenAI-compatible shape both nest the message under `error`.
  return data.error?.message ?? data.error?.status;
}

export interface ConnectorTestResult {
  ok: boolean
  status: number
  statusText: string
  durationMs: number
  requestUrl: string
  parsed?: ParsedResponse
  rawResponse?: unknown
  errorMessage?: string
  transportError?: string
}

// Never echo the key back into the UI, but keep enough to tell two keys apart.
export function redactKey(apiKey: string) {
  const key = apiKey.trim();

  if (key.length <= 8) {
    return key === '' ? '(none)' : '***';
  }

  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export async function testConnector(
  input: ConnectorRequestInput,
  { fetchImpl = fetch }: { fetchImpl?: typeof fetch } = {},
): Promise<ConnectorTestResult> {
  const { url, headers, body } = buildRequest(input);
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let payload: unknown;

    try {
      payload = raw === '' ? undefined : JSON.parse(raw);
    }
    catch {
      payload = raw;
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startedAt,
      requestUrl: url,
      rawResponse: payload,
      parsed: response.ok ? parseResponse({ provider: input.provider, payload }) : undefined,
      errorMessage: response.ok ? undefined : extractApiErrorMessage({ provider: input.provider, payload }),
    };
  }
  catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: 'Request failed',
      durationMs: Date.now() - startedAt,
      requestUrl: url,
      transportError: error instanceof Error ? error.message : String(error),
    };
  }
}
