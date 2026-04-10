import OpenAI from 'openai';
import type { EmbeddingProvider } from '@lineage/core';

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  dimensions?: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  readonly modelId: string;
  readonly dimensions: number;

  constructor(options: OpenAIEmbeddingOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(options.baseURL && { baseURL: options.baseURL }),
    });
    this.modelId = options.model ?? 'text-embedding-3-small';
    this.dimensions = options.dimensions ?? 1536;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.modelId,
      input: texts,
      dimensions: this.dimensions,
    });

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
