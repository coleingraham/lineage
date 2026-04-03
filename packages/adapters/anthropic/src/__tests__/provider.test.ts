import { describe, expect, it, vi } from 'vitest';
import type { GenerationConfig, Message } from '@lineage/core';
import { AnthropicProvider } from '../provider.js';

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn(),
        stream: vi.fn(),
      };
    },
  };
});

function createProvider() {
  return new AnthropicProvider({
    apiKey: 'test-key',
    model: 'claude-sonnet-4-6',
  });
}

describe('AnthropicProvider', () => {
  describe('complete', () => {
    it('returns concatenated text from response blocks', async () => {
      const provider = createProvider();

      // Access the mocked client
      const client = (
        provider as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }
      ).client;
      client.messages.create.mockResolvedValue({
        content: [
          { type: 'text', text: 'Hello, ' },
          { type: 'text', text: 'world!' },
        ],
      });

      const messages: Message[] = [{ role: 'human', content: 'Hi' }];
      const config: GenerationConfig = { maxTokens: 256 };

      const result = await provider.complete(messages, config);
      expect(result).toBe('Hello, world!');
    });

    it('maps human role to user and ai role to assistant', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }
      ).client;
      client.messages.create.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      const messages: Message[] = [
        { role: 'human', content: 'Hello' },
        { role: 'ai', content: 'Hi there' },
        { role: 'human', content: 'How are you?' },
      ];
      const config: GenerationConfig = { maxTokens: 100 };

      await provider.complete(messages, config);

      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' },
            { role: 'user', content: 'How are you?' },
          ],
        }),
      );
    });

    it('extracts system messages into the system parameter', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }
      ).client;
      client.messages.create.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'human', content: 'Hi' },
      ];
      const config: GenerationConfig = { maxTokens: 100 };

      await provider.complete(messages, config);

      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      );
    });

    it('passes temperature when provided', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }
      ).client;
      client.messages.create.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      await provider.complete([{ role: 'human', content: 'Hi' }], {
        maxTokens: 100,
        temperature: 0.5,
      });

      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.5 }),
      );
    });

    it('omits temperature when not provided', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }
      ).client;
      client.messages.create.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

      await provider.complete([{ role: 'human', content: 'Hi' }], { maxTokens: 100 });

      const call = client.messages.create.mock.calls[0][0];
      expect(call).not.toHaveProperty('temperature');
    });
  });

  describe('stream', () => {
    it('yields text deltas from the stream', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as { client: { messages: { stream: ReturnType<typeof vi.fn> } } }
      ).client;

      const events = [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ', world' } },
        { type: 'message_stop' },
      ];

      client.messages.stream.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) {
            yield event;
          }
        },
      });

      const chunks: string[] = [];
      for await (const chunk of provider.stream([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ', world']);
    });

    it('filters out non-text-delta events', async () => {
      const provider = createProvider();
      const client = (
        provider as unknown as { client: { messages: { stream: ReturnType<typeof vi.fn> } } }
      ).client;

      const events = [
        { type: 'message_start', message: {} },
        { type: 'content_block_start', content_block: { type: 'text' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_stop' },
        { type: 'message_delta', delta: {} },
        { type: 'message_stop' },
      ];

      client.messages.stream.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) {
            yield event;
          }
        },
      });

      const chunks: string[] = [];
      for await (const chunk of provider.stream([{ role: 'human', content: 'Hi' }], {
        maxTokens: 256,
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello']);
    });
  });
});
