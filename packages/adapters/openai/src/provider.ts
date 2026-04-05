import OpenAI from 'openai';
import type { GenerationConfig, LLMProvider, Message } from '@lineage/core';

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  baseURL?: string;
}

const ROLE_MAP: Record<Message['role'], 'user' | 'assistant' | 'system'> = {
  human: 'user',
  ai: 'assistant',
  system: 'system',
};

function toOpenAIMessages(messages: Message[]): OpenAI.ChatCompletionMessageParam[] {
  return messages.map((msg) => ({
    role: ROLE_MAP[msg.role],
    content: msg.content,
  }));
}

export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL && { baseURL: options.baseURL }),
    });
    this.model = options.model;
  }

  async complete(messages: Message[], config: GenerationConfig): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: config.model ?? this.model,
      max_tokens: config.maxTokens,
      ...(config.temperature !== undefined && { temperature: config.temperature }),
      messages: toOpenAIMessages(messages),
    });

    return response.choices[0]?.message?.content ?? '';
  }

  async *stream(messages: Message[], config: GenerationConfig): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: config.model ?? this.model,
      max_tokens: config.maxTokens,
      ...(config.temperature !== undefined && { temperature: config.temperature }),
      messages: toOpenAIMessages(messages),
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
