import { describe, expect, it, vi } from 'vitest';
import type { GenerationConfig, Message } from '@lineage/core';
import { OpenAIProvider } from '../provider.js';

// Mock the OpenAI SDK
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn(),
        },
      };
    },
  };
});

function createProvider() {
  return new OpenAIProvider({
    apiKey: 'test-key',
    model: 'gpt-4o',
  });
}

describe('OpenAIProvider', () => {
  describe('complete', () => {
    it('returns content from the first choice', async () => {
      const provider = createProvider();

      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;
      client.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Hello, world!' } }],
      });

      const messages: Message[] = [{ role: 'human', content: 'Hi' }];
      const config: GenerationConfig = { maxTokens: 256 };

      const result = await provider.complete(messages, config);
      expect(result).toBe('Hello, world!');
    });

    it('maps human role to user and ai role to assistant', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;
      client.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      const messages: Message[] = [
        { role: 'human', content: 'Hello' },
        { role: 'ai', content: 'Hi there' },
        { role: 'human', content: 'How are you?' },
      ];
      const config: GenerationConfig = { maxTokens: 100 };

      await provider.complete(messages, config);

      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
            { role: 'user', content: 'How are you?' },
          ],
        }),
      );
    });

    it('maps system messages to system role', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;
      client.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'human', content: 'Hi' },
      ];
      const config: GenerationConfig = { maxTokens: 100 };

      await provider.complete(messages, config);

      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hi' },
          ],
        }),
      );
    });

    it('passes temperature when provided', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;
      client.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await provider.complete([{ role: 'human', content: 'Hi' }], {
        maxTokens: 100,
        temperature: 0.5,
      });

      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 }),
      );
    });

    it('omits temperature when not provided', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;
      client.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
      });

      await provider.complete([{ role: 'human', content: 'Hi' }], { maxTokens: 100 });

      const call = client.chat.completions.create.mock.calls[0][0];
      expect(call).not.toHaveProperty('temperature');
    });

    it('returns empty string when content is null', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;
      client.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await provider.complete([{ role: 'human', content: 'Hi' }], {
        maxTokens: 100,
      });
      expect(result).toBe('');
    });
  });

  describe('stream', () => {
    it('yields content deltas from the stream', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;

      const chunks = [
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ', world' } }] },
        { choices: [{ delta: {} }] },
      ];

      client.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const results: string[] = [];
      for await (const chunk of provider.stream([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      })) {
        results.push(chunk);
      }

      expect(results).toEqual(['Hello', ', world']);
    });

    it('filters out chunks with no content', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;

      const chunks = [
        { choices: [{ delta: { role: 'assistant' } }] },
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: {} }] },
      ];

      client.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const results: string[] = [];
      for await (const chunk of provider.stream([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      })) {
        results.push(chunk);
      }

      expect(results).toEqual(['Hello']);
    });

    it('passes stream: true to the API', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as {
          client: { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
        }
      ).client;

      client.chat.completions.create.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          // empty stream
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of provider.stream([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      })) {
        // consume
      }

      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ stream: true }),
      );
    });
  });
});
