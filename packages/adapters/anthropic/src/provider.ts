import Anthropic from '@anthropic-ai/sdk';
import type { GenerationConfig, LLMProvider, Message } from '@lineage/core';

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}

const ROLE_MAP: Record<Message['role'], 'user' | 'assistant'> = {
  human: 'user',
  ai: 'assistant',
  system: 'user',
};

function toAnthropicMessages(messages: Message[]): {
  system: string | undefined;
  messages: Anthropic.MessageParam[];
} {
  let system: string | undefined;
  const mapped: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content;
    } else {
      mapped.push({ role: ROLE_MAP[msg.role], content: msg.content });
    }
  }

  return { system, messages: mapped };
}

export class AnthropicProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      ...(options.baseURL && { baseURL: options.baseURL }),
    });
    this.model = options.model;
  }

  async complete(messages: Message[], config: GenerationConfig): Promise<string> {
    const { system, messages: mapped } = toAnthropicMessages(messages);

    const response = await this.client.messages.create({
      model: config.model ?? this.model,
      max_tokens: config.maxTokens,
      ...(config.temperature !== undefined && { temperature: config.temperature }),
      ...(system && { system }),
      messages: mapped,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  async *stream(messages: Message[], config: GenerationConfig): AsyncIterable<string> {
    const { system, messages: mapped } = toAnthropicMessages(messages);

    const stream = this.client.messages.stream({
      model: config.model ?? this.model,
      max_tokens: config.maxTokens,
      ...(config.temperature !== undefined && { temperature: config.temperature }),
      ...(system && { system }),
      messages: mapped,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
