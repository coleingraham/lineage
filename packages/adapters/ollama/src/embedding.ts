import type { EmbeddingProvider } from '@lineage/core';

export interface OllamaEmbeddingOptions {
  model: string;
  baseURL?: string;
  dimensions?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly baseURL: string;
  readonly modelId: string;
  readonly dimensions: number;

  constructor(options: OllamaEmbeddingOptions) {
    this.baseURL = (options.baseURL ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.modelId = options.model;
    this.dimensions = options.dimensions ?? 0;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const response = await fetch(`${this.baseURL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.modelId, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embeddings request failed: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { embedding: number[] };
      results.push(data.embedding);
    }

    return results;
  }
}
