import type { GenerationConfig, LLMProvider, Message } from '@lineage/core';

export interface OllamaProviderOptions {
  model: string;
  baseURL?: string;
}

const ROLE_MAP: Record<Message['role'], 'user' | 'assistant' | 'system'> = {
  human: 'user',
  ai: 'assistant',
  system: 'system',
};

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function toOllamaMessages(messages: Message[]): OllamaMessage[] {
  return messages.map((msg) => ({
    role: ROLE_MAP[msg.role],
    content: msg.content,
  }));
}

export class OllamaProvider implements LLMProvider {
  private readonly baseURL: string;
  private readonly model: string;

  constructor(options: OllamaProviderOptions) {
    this.baseURL = (options.baseURL ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = options.model;
  }

  async complete(messages: Message[], config: GenerationConfig): Promise<string> {
    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: toOllamaMessages(messages),
        stream: false,
        options: {
          num_predict: config.maxTokens,
          ...(config.temperature !== undefined && { temperature: config.temperature }),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  }

  async *stream(messages: Message[], config: GenerationConfig): AsyncIterable<string> {
    const response = await fetch(`${this.baseURL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: toOllamaMessages(messages),
        stream: true,
        options: {
          num_predict: config.maxTokens,
          ...(config.temperature !== undefined && { temperature: config.temperature }),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
          const content = chunk.message?.content;
          if (content) {
            yield content;
          }
        }
      }

      if (buffer.trim()) {
        const chunk = JSON.parse(buffer) as { message?: { content?: string }; done?: boolean };
        const content = chunk.message?.content;
        if (content) {
          yield content;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
