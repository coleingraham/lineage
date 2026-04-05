export interface Message {
  role: 'human' | 'ai' | 'system';
  content: string;
}

export interface GenerationConfig {
  maxTokens: number;
  temperature?: number;
}

export interface StreamChunk {
  content: string;
  thinking?: boolean;
}

export type StreamToken = string | StreamChunk;

export interface LLMProvider {
  complete(messages: Message[], config: GenerationConfig): Promise<string>;
  stream(messages: Message[], config: GenerationConfig): AsyncIterable<StreamToken>;
}
