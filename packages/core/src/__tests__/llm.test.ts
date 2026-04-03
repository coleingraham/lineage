import { describe, it, expect } from 'vitest';
import type { Message, GenerationConfig, LLMProvider } from '../index.js';

describe('Message type', () => {
  it('accepts all valid roles', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'human', content: 'Hello' },
      { role: 'ai', content: 'Hi there!' },
    ];
    expect(messages).toHaveLength(3);
  });
});

describe('GenerationConfig type', () => {
  it('requires maxTokens', () => {
    const config: GenerationConfig = { maxTokens: 1024 };
    expect(config.maxTokens).toBe(1024);
    expect(config.temperature).toBeUndefined();
  });

  it('accepts optional temperature', () => {
    const config: GenerationConfig = { maxTokens: 512, temperature: 0.7 };
    expect(config.temperature).toBe(0.7);
  });
});

describe('LLMProvider interface', () => {
  it('can be implemented with complete and stream methods', async () => {
    const provider: LLMProvider = {
      async complete(messages, config) {
        return `response (${messages.length} messages, max ${config.maxTokens} tokens)`;
      },
      async *stream(messages, config) {
        yield `chunk (${messages.length} messages, max ${config.maxTokens} tokens)`;
      },
    };

    const messages: Message[] = [{ role: 'human', content: 'Hello' }];
    const config: GenerationConfig = { maxTokens: 256 };

    const result = await provider.complete(messages, config);
    expect(result).toBe('response (1 messages, max 256 tokens)');

    const chunks: string[] = [];
    for await (const chunk of provider.stream(messages, config)) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['chunk (1 messages, max 256 tokens)']);
  });
});
