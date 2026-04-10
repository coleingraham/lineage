import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type BedrockRuntimeClientConfig,
} from '@aws-sdk/client-bedrock-runtime';
import type { EmbeddingProvider } from '@lineage/core';

export interface BedrockEmbeddingOptions {
  region?: string;
  model?: string;
  dimensions?: number;
  clientConfig?: BedrockRuntimeClientConfig;
}

export class BedrockEmbeddingProvider implements EmbeddingProvider {
  private readonly client: BedrockRuntimeClient;
  readonly modelId: string;
  readonly dimensions: number;

  constructor(options: BedrockEmbeddingOptions = {}) {
    this.client = new BedrockRuntimeClient({
      ...(options.region && { region: options.region }),
      ...options.clientConfig,
    });
    this.modelId = options.model ?? 'amazon.titan-embed-text-v2:0';
    this.dimensions = options.dimensions ?? 1024;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          inputText: text,
          dimensions: this.dimensions,
        }),
      });

      const response = await this.client.send(command);
      const body = JSON.parse(new TextDecoder().decode(response.body)) as {
        embedding: number[];
      };
      results.push(body.embedding);
    }

    return results;
  }
}
