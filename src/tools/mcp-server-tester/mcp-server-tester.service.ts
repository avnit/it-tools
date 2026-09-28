export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SESSION_HEADER = 'mcp-session-id';

export type McpMethod =
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'prompts/list'
  | 'ping';

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface McpCallResult {
  ok: boolean
  status: number
  statusText: string
  durationMs: number
  request: JsonRpcRequest
  response?: unknown
  error?: JsonRpcError
  sessionId?: string
  contentType?: string
  transportError?: string
}

let requestCounter = 0;

export function nextRequestId() {
  requestCounter += 1;
  return requestCounter;
}

export function resetRequestId() {
  requestCounter = 0;
}

export function buildJsonRpcRequest({ method, params, id }: { method: string; params?: Record<string, unknown>; id?: number | string }): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    ...(id === undefined ? {} : { id }),
    method,
    ...(params === undefined ? {} : { params }),
  };
}

export function buildInitializeParams({ clientName = 'it-tools-mcp-tester', clientVersion = '1.0.0', protocolVersion = MCP_PROTOCOL_VERSION }: { clientName?: string; clientVersion?: string; protocolVersion?: string } = {}) {
  return {
    protocolVersion,
    capabilities: { roots: { listChanged: false }, sampling: {} },
    clientInfo: { name: clientName, version: clientVersion },
  };
}

// Parses a textarea of `Header-Name: value` lines into a header record.
export function parseHeaderLines(raw: string): Record<string, string> {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .reduce((headers: Record<string, string>, line) => {
      const separatorIndex = line.indexOf(':');

      if (separatorIndex <= 0) {
        return headers;
      }

      const name = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      return name.length > 0 ? { ...headers, [name]: value } : headers;
    }, {});
}

export function buildRequestHeaders({ rawHeaders = '', bearerToken = '', sessionId = '', protocolVersion = MCP_PROTOCOL_VERSION }: { rawHeaders?: string; bearerToken?: string; sessionId?: string; protocolVersion?: string } = {}) {
  return {
    'Content-Type': 'application/json',
    // Streamable HTTP servers may answer with either a plain JSON body or an SSE stream.
    'Accept': 'application/json, text/event-stream',
    'MCP-Protocol-Version': protocolVersion,
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    ...parseHeaderLines(rawHeaders),
  };
}

// Server-sent-event bodies carry one JSON-RPC message per `data:` field.
export function parseSseBody(body: string): unknown[] {
  return body
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice('data:'.length).trim())
    .filter(payload => payload.length > 0 && payload !== '[DONE]')
    .flatMap((payload) => {
      try {
        return [JSON.parse(payload)];
      }
      catch {
        return [];
      }
    });
}

export function parseResponseBody({ body, contentType = '' }: { body: string; contentType?: string }): unknown {
  if (body.trim() === '') {
    return undefined;
  }

  if (contentType.includes('text/event-stream')) {
    const messages = parseSseBody(body);

    // A single response is far more common than a batch; unwrap it for readability.
    return messages.length === 1 ? messages[0] : messages;
  }

  try {
    return JSON.parse(body);
  }
  catch {
    return body;
  }
}

export function extractJsonRpcError(payload: unknown): JsonRpcError | undefined {
  const messages = Array.isArray(payload) ? payload : [payload];

  const errored = messages.find(
    (message): message is { error: JsonRpcError } =>
      typeof message === 'object' && message !== null && 'error' in message,
  );

  return errored?.error;
}

export async function sendMcpRequest({
  url,
  method,
  params,
  rawHeaders = '',
  bearerToken = '',
  sessionId = '',
  protocolVersion = MCP_PROTOCOL_VERSION,
  isNotification = false,
  fetchImpl = fetch,
}: {
  url: string
  method: string
  params?: Record<string, unknown>
  rawHeaders?: string
  bearerToken?: string
  sessionId?: string
  protocolVersion?: string
  isNotification?: boolean
  fetchImpl?: typeof fetch
}): Promise<McpCallResult> {
  const request = buildJsonRpcRequest({ method, params, id: isNotification ? undefined : nextRequestId() });
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: buildRequestHeaders({ rawHeaders, bearerToken, sessionId, protocolVersion }),
      body: JSON.stringify(request),
    });

    const contentType = response.headers.get('content-type') ?? '';
    const body = await response.text();
    const payload = parseResponseBody({ body, contentType });

    return {
      ok: response.ok && extractJsonRpcError(payload) === undefined,
      status: response.status,
      statusText: response.statusText,
      durationMs: Date.now() - startedAt,
      request,
      response: payload,
      error: extractJsonRpcError(payload),
      sessionId: response.headers.get(MCP_SESSION_HEADER) ?? undefined,
      contentType,
    };
  }
  catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: 'Request failed',
      durationMs: Date.now() - startedAt,
      request,
      transportError: error instanceof Error ? error.message : String(error),
    };
  }
}

export interface McpToolSummary {
  name: string
  description: string
  inputSchema: unknown
}

export function extractToolList(payload: unknown): McpToolSummary[] {
  const messages = Array.isArray(payload) ? payload : [payload];

  const tools = messages
    .flatMap((message) => {
      const result = (message as { result?: { tools?: unknown } } | undefined)?.result;

      return Array.isArray(result?.tools) ? (result?.tools as unknown[]) : [];
    });

  return tools.map((tool) => {
    const { name, description, inputSchema } = (tool ?? {}) as Record<string, unknown>;

    return {
      name: String(name ?? 'unnamed'),
      description: String(description ?? ''),
      inputSchema,
    };
  });
}

// A failed cross-origin request surfaces as an opaque TypeError, so hint at the likely cause.
export function isLikelyCorsFailure({ transportError, status }: { transportError?: string; status: number }) {
  return status === 0 && Boolean(transportError);
}
