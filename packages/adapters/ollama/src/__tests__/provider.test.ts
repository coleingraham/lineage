import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Message } from '@lineage/core';
import { OllamaProvider } from '../provider.js';

function createProvider(baseURL?: string) {
  return new OllamaProvider({
    model: 'llama3',
    ...(baseURL && { baseURL }),
  });
}

function mockFetchResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockStreamResponse(chunks: unknown[]) {
  const lines = chunks.map((c) => JSON.stringify(c) + '\n');
  let index = 0;
  const encoder = new TextEncoder();

  const body = {
    getReader: () => ({
      read: () => {
        if (index < lines.length) {
          return Promise.resolve({ done: false, value: encoder.encode(lines[index++]) });
        }
        return Promise.resolve({ done: true, value: undefined });
      },
      releaseLock: vi.fn(),
    }),
  };

  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body,
  } as unknown as Response;
}

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('complete', () => {
    it('returns message content from the response', async () => {
      const provider = createProvider();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse({ message: { role: 'assistant', content: 'Hello, world!' } }),
      );

      const result = await provider.complete([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      });

      expect(result).toBe('Hello, world!');
    });

    it('maps human role to user and ai role to assistant', async () => {
      const provider = createProvider();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ message: { role: 'assistant', content: 'ok' } }));

      const messages: Message[] = [
        { role: 'human', content: 'Hello' },
        { role: 'ai', content: 'Hi there' },
        { role: 'human', content: 'How are you?' },
      ];

      await provider.complete(messages, { maxTokens: 100 });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.messages).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ]);
    });

    it('maps system messages to system role', async () => {
      const provider = createProvider();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ message: { role: 'assistant', content: 'ok' } }));

      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'human', content: 'Hi' },
      ];

      await provider.complete(messages, { maxTokens: 100 });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ]);
    });

    it('passes temperature when provided', async () => {
      const provider = createProvider();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ message: { role: 'assistant', content: 'ok' } }));

      await provider.complete([{ role: 'human', content: 'Hi' }], {
        maxTokens: 100,
        temperature: 0.5,
      });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.options.temperature).toBe(0.5);
    });

    it('omits temperature when not provided', async () => {
      const provider = createProvider();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ message: { role: 'assistant', content: 'ok' } }));

      await provider.complete([{ role: 'human', content: 'Hi' }], { maxTokens: 100 });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.options).not.toHaveProperty('temperature');
    });

    it('passes num_predict from maxTokens', async () => {
      const provider = createProvider();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ message: { role: 'assistant', content: 'ok' } }));

      await provider.complete([{ role: 'human', content: 'Hi' }], { maxTokens: 512 });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.options.num_predict).toBe(512);
    });

    it('sends stream: false for complete calls', async () => {
      const provider = createProvider();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ message: { role: 'assistant', content: 'ok' } }));

      await provider.complete([{ role: 'human', content: 'Hi' }], { maxTokens: 100 });

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.stream).toBe(false);
    });

    it('returns empty string when content is missing', async () => {
      const provider = createProvider();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFetchResponse({ message: {} }));

      const result = await provider.complete([{ role: 'human', content: 'Hi' }], {
        maxTokens: 100,
      });
      expect(result).toBe('');
    });

    it('uses default base URL when none provided', async () => {
      const provider = createProvider();
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ message: { role: 'assistant', content: 'ok' } }));

      await provider.complete([{ role: 'human', content: 'Hi' }], { maxTokens: 100 });

      expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    });

    it('uses custom base URL when provided', async () => {
      const provider = createProvider('http://myhost:8080');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockFetchResponse({ message: { role: 'assistant', content: 'ok' } }));

      await provider.complete([{ role: 'human', content: 'Hi' }], { maxTokens: 100 });

      expect(fetchSpy.mock.calls[0][0]).toBe('http://myhost:8080/api/chat');
    });

    it('throws on non-ok response', async () => {
      const provider = createProvider();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(
        provider.complete([{ role: 'human', content: 'Hi' }], { maxTokens: 100 }),
      ).rejects.toThrow('Ollama request failed: 500 Internal Server Error');
    });
  });

  describe('stream', () => {
    it('yields content deltas from the stream', async () => {
      const provider = createProvider();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockStreamResponse([
          { message: { role: 'assistant', content: 'Hello' }, done: false },
          { message: { role: 'assistant', content: ', world' }, done: false },
          { message: { role: 'assistant', content: '' }, done: true },
        ]),
      );

      const results: string[] = [];
      for await (const chunk of provider.stream([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      })) {
        results.push(chunk);
      }

      expect(results).toEqual(['Hello', ', world']);
    });

    it('filters out chunks with empty content', async () => {
      const provider = createProvider();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockStreamResponse([
          { message: { role: 'assistant', content: '' }, done: false },
          { message: { role: 'assistant', content: 'Hello' }, done: false },
          { message: { role: 'assistant', content: '' }, done: true },
        ]),
      );

      const results: string[] = [];
      for await (const chunk of provider.stream([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      })) {
        results.push(chunk);
      }

      expect(results).toEqual(['Hello']);
    });

    it('sends stream: true for stream calls', async () => {
      const provider = createProvider();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockStreamResponse([]));

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of provider.stream([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      })) {
        // consume
      }

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.stream).toBe(true);
    });

    it('throws on non-ok response', async () => {
      const provider = createProvider();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      const iter = provider.stream([{ role: 'human', content: 'Hi' }], { maxTokens: 100 });
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of iter) {
          // consume
        }
      }).rejects.toThrow('Ollama request failed: 404 Not Found');
    });
  });
});
