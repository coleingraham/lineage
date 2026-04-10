import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BedrockEmbeddingProvider } from '../embedding.js';

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: class {
      send = vi.fn();
    },
    InvokeModelCommand: class {
      input: unknown;
      constructor(input: unknown) {
        this.input = input;
      }
    },
  };
});

function createProvider(options?: { model?: string; region?: string; dimensions?: number }) {
  return new BedrockEmbeddingProvider(options);
}

function getClient(provider: BedrockEmbeddingProvider) {
  return (provider as unknown as { client: { send: ReturnType<typeof vi.fn> } }).client;
}

function encodeResponse(embedding: number[]) {
  return new TextEncoder().encode(JSON.stringify({ embedding }));
}

describe('BedrockEmbeddingProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses amazon.titan-embed-text-v2:0 as default model', () => {
    const provider = createProvider();
    expect(provider.modelId).toBe('amazon.titan-embed-text-v2:0');
  });

  it('uses 1024 as default dimensions', () => {
    const provider = createProvider();
    expect(provider.dimensions).toBe(1024);
  });

  it('accepts custom model and dimensions', () => {
    const provider = createProvider({ model: 'cohere.embed-english-v3', dimensions: 512 });
    expect(provider.modelId).toBe('cohere.embed-english-v3');
    expect(provider.dimensions).toBe(512);
  });

  it('returns embeddings for each input text', async () => {
    const provider = createProvider();
    const client = getClient(provider);

    client.send
      .mockResolvedValueOnce({ body: encodeResponse([0.1, 0.2]) })
      .mockResolvedValueOnce({ body: encodeResponse([0.3, 0.4]) });

    const result = await provider.embed(['hello', 'world']);

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('sends inputText and dimensions in the command body', async () => {
    const provider = createProvider({ dimensions: 256 });
    const client = getClient(provider);

    client.send.mockResolvedValue({ body: encodeResponse([0.1]) });

    await provider.embed(['test text']);

    const command = client.send.mock.calls[0][0] as { input: { body: string; modelId: string } };
    const body = JSON.parse(command.input.body);
    expect(body).toEqual({ inputText: 'test text', dimensions: 256 });
  });

  it('sends the correct modelId in the command', async () => {
    const provider = createProvider({ model: 'amazon.titan-embed-text-v2:0' });
    const client = getClient(provider);

    client.send.mockResolvedValue({ body: encodeResponse([0.1]) });

    await provider.embed(['test']);

    const command = client.send.mock.calls[0][0] as { input: { modelId: string } };
    expect(command.input.modelId).toBe('amazon.titan-embed-text-v2:0');
  });
});
