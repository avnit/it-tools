import { describe, expect, it } from 'vitest';
import {
  buildInitializeParams,
  buildJsonRpcRequest,
  buildRequestHeaders,
  extractJsonRpcError,
  extractToolList,
  parseHeaderLines,
  parseResponseBody,
  parseSseBody,
} from './mcp-server-tester.service';

describe('mcp-server-tester', () => {
  describe('buildJsonRpcRequest', () => {
    it('builds a request with an id', () => {
      expect(buildJsonRpcRequest({ method: 'tools/list', id: 3 })).toEqual({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      });
    });

    it('omits the id for notifications', () => {
      expect(buildJsonRpcRequest({ method: 'notifications/initialized' })).toEqual({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
    });

    it('includes params when provided', () => {
      expect(buildJsonRpcRequest({ method: 'tools/call', id: 1, params: { name: 'echo' } })).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'echo' },
      });
    });
  });

  describe('buildInitializeParams', () => {
    it('advertises the client and protocol version', () => {
      expect(buildInitializeParams({ clientName: 'tester', clientVersion: '2.0.0', protocolVersion: '2025-06-18' })).toEqual({
        protocolVersion: '2025-06-18',
        capabilities: { roots: { listChanged: false }, sampling: {} },
        clientInfo: { name: 'tester', version: '2.0.0' },
      });
    });
  });

  describe('parseHeaderLines', () => {
    it('parses colon separated lines', () => {
      expect(parseHeaderLines('X-Api-Key: abc\nX-Tenant: acme')).toEqual({
        'X-Api-Key': 'abc',
        'X-Tenant': 'acme',
      });
    });

    it('ignores blank lines, comments and malformed entries', () => {
      expect(parseHeaderLines('\n# a comment\nnot-a-header\n: novalue\nX-Ok: yes')).toEqual({ 'X-Ok': 'yes' });
    });

    it('keeps colons inside the value', () => {
      expect(parseHeaderLines('X-Url: https://example.com:8080/mcp')).toEqual({ 'X-Url': 'https://example.com:8080/mcp' });
    });
  });

  describe('buildRequestHeaders', () => {
    it('accepts both json and sse responses', () => {
      expect(buildRequestHeaders().Accept).toBe('application/json, text/event-stream');
    });

    it('adds the bearer token and session id when set', () => {
      const headers = buildRequestHeaders({ bearerToken: 'tok', sessionId: 'sess-1' });

      expect(headers.Authorization).toBe('Bearer tok');
      expect(headers['Mcp-Session-Id']).toBe('sess-1');
    });

    it('lets custom headers override the defaults', () => {
      expect(buildRequestHeaders({ rawHeaders: 'Accept: application/json' }).Accept).toBe('application/json');
    });
  });

  describe('parseSseBody', () => {
    it('extracts json payloads from data fields', () => {
      const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n';

      expect(parseSseBody(body)).toEqual([{ jsonrpc: '2.0', id: 1, result: {} }]);
    });

    it('skips non parsable payloads', () => {
      expect(parseSseBody('data: not json\ndata: [DONE]\n')).toEqual([]);
    });
  });

  describe('parseResponseBody', () => {
    it('parses a plain json body', () => {
      expect(parseResponseBody({ body: '{"a":1}', contentType: 'application/json' })).toEqual({ a: 1 });
    });

    it('unwraps a single sse message', () => {
      expect(parseResponseBody({ body: 'data: {"a":1}\n', contentType: 'text/event-stream' })).toEqual({ a: 1 });
    });

    it('returns undefined for an empty body', () => {
      expect(parseResponseBody({ body: '   ' })).toBeUndefined();
    });

    it('falls back to the raw text when the body is not json', () => {
      expect(parseResponseBody({ body: 'Not Found', contentType: 'text/plain' })).toBe('Not Found');
    });
  });

  describe('extractJsonRpcError', () => {
    it('returns the error when present', () => {
      expect(extractJsonRpcError({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }))
        .toEqual({ code: -32601, message: 'Method not found' });
    });

    it('returns undefined for a successful result', () => {
      expect(extractJsonRpcError({ jsonrpc: '2.0', id: 1, result: {} })).toBeUndefined();
    });

    it('finds an error inside a batch', () => {
      const payload = [{ result: {} }, { error: { code: -1, message: 'boom' } }];

      expect(extractJsonRpcError(payload)).toEqual({ code: -1, message: 'boom' });
    });
  });

  describe('extractToolList', () => {
    it('maps the tools of a tools/list result', () => {
      const payload = {
        result: {
          tools: [{ name: 'search', description: 'Search the web', inputSchema: { type: 'object' } }],
        },
      };

      expect(extractToolList(payload)).toEqual([
        { name: 'search', description: 'Search the web', inputSchema: { type: 'object' } },
      ]);
    });

    it('returns an empty list when there is no tools array', () => {
      expect(extractToolList({ result: {} })).toEqual([]);
    });
  });
});
