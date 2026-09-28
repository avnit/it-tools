import { describe, expect, it } from 'vitest';
import {
  buildRequest,
  extractApiErrorMessage,
  getProvider,
  parseResponse,
  redactKey,
} from './llm-connector-tester.service';

const baseInput = {
  apiKey: 'test-key',
  model: 'test-model',
  prompt: 'Say hello',
  maxTokens: 64,
};

describe('llm-connector-tester', () => {
  describe('buildRequest', () => {
    it('targets the Anthropic messages endpoint with the browser opt-in header', () => {
      const { url, headers, body } = buildRequest({
        ...baseInput,
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-opus-5',
      });

      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(headers['x-api-key']).toBe('test-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
      expect(body).toEqual({
        model: 'claude-opus-5',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'Say hello' }],
      });
    });

    it('sends the Gemini key as a header and the model in the path', () => {
      const { url, headers, body } = buildRequest({
        ...baseInput,
        provider: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-2.5-pro',
      });

      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent');
      expect(headers['x-goog-api-key']).toBe('test-key');
      expect(url).not.toContain('test-key');
      expect(body).toEqual({
        contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
        generationConfig: { maxOutputTokens: 64 },
      });
    });

    it('uses a bearer token for OpenAI-compatible endpoints', () => {
      const { url, headers, body } = buildRequest({
        ...baseInput,
        provider: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1/',
      });

      expect(url).toBe('http://localhost:11434/v1/chat/completions');
      expect(headers.Authorization).toBe('Bearer test-key');
      expect(body.messages).toEqual([{ role: 'user', content: 'Say hello' }]);
    });

    it('places the system prompt where each provider expects it', () => {
      const withSystem = { ...baseInput, systemPrompt: 'Be brief' };

      expect(buildRequest({ ...withSystem, provider: 'anthropic', baseUrl: 'https://api.anthropic.com' }).body.system)
        .toBe('Be brief');
      expect(buildRequest({ ...withSystem, provider: 'gemini', baseUrl: 'https://g.example' }).body.systemInstruction)
        .toEqual({ parts: [{ text: 'Be brief' }] });
      expect((buildRequest({ ...withSystem, provider: 'openai-compatible', baseUrl: 'https://o.example' }).body.messages as unknown[])[0])
        .toEqual({ role: 'system', content: 'Be brief' });
    });

    it('omits an empty system prompt', () => {
      const { body } = buildRequest({ ...baseInput, provider: 'anthropic', baseUrl: 'https://api.anthropic.com', systemPrompt: '   ' });

      expect(body).not.toHaveProperty('system');
    });
  });

  describe('parseResponse', () => {
    it('joins Anthropic text blocks and reads the usage', () => {
      const payload = {
        model: 'claude-opus-5',
        stop_reason: 'end_turn',
        content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Hello' }, { type: 'text', text: ' there' }],
        usage: { input_tokens: 12, output_tokens: 3 },
      };

      expect(parseResponse({ provider: 'anthropic', payload })).toEqual({
        text: 'Hello there',
        model: 'claude-opus-5',
        stopReason: 'end_turn',
        usage: { inputTokens: 12, outputTokens: 3 },
      });
    });

    it('reads the first Gemini candidate', () => {
      const payload = {
        modelVersion: 'gemini-2.5-pro',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Hi' }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 },
      };

      expect(parseResponse({ provider: 'gemini', payload })).toEqual({
        text: 'Hi',
        model: 'gemini-2.5-pro',
        stopReason: 'STOP',
        usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
      });
    });

    it('reads the first OpenAI-compatible choice', () => {
      const payload = {
        model: 'local-model',
        choices: [{ finish_reason: 'stop', message: { content: 'Yo' } }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      };

      expect(parseResponse({ provider: 'openai-compatible', payload }).text).toBe('Yo');
    });

    it('returns empty text rather than throwing on an unexpected shape', () => {
      expect(parseResponse({ provider: 'anthropic', payload: {} }).text).toBe('');
      expect(parseResponse({ provider: 'gemini', payload: undefined }).text).toBe('');
      expect(parseResponse({ provider: 'openai-compatible', payload: { choices: [] } }).text).toBe('');
    });
  });

  describe('extractApiErrorMessage', () => {
    it('reads the provider error message', () => {
      expect(extractApiErrorMessage({ provider: 'anthropic', payload: { error: { message: 'invalid x-api-key' } } }))
        .toBe('invalid x-api-key');
      expect(extractApiErrorMessage({ provider: 'gemini', payload: { error: { message: 'API key not valid' } } }))
        .toBe('API key not valid');
    });

    it('returns undefined when there is no error', () => {
      expect(extractApiErrorMessage({ provider: 'anthropic', payload: { content: [] } })).toBeUndefined();
    });
  });

  describe('redactKey', () => {
    it('keeps only the outer characters', () => {
      expect(redactKey('sk-ant-0123456789abcdef')).toBe('sk-a...cdef');
    });

    it('fully masks short keys', () => {
      expect(redactKey('short')).toBe('***');
      expect(redactKey('')).toBe('(none)');
    });
  });

  describe('getProvider', () => {
    it('returns the definition', () => {
      expect(getProvider('gemini').defaultModel).toBe('gemini-2.5-pro');
    });

    it('throws on an unknown provider', () => {
      expect(() => getProvider('nope' as never)).toThrow('Unknown provider: nope');
    });
  });
});
