import { describe, expect, it, vi } from 'vitest';
import { OpenAIEmbeddingProvider } from '../embedding.js';

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = {
        create: vi.fn(),
      };
    },
  };
});

function createProvider(options?: { model?: string; dimensions?: number }) {
  return new OpenAIEmbeddingProvider({
    apiKey: 'test-key',
    ...options,
  });
}

function getClient(provider: OpenAIEmbeddingProvider) {
  return (
    provider as unknown as {
      client: { embeddings: { create: ReturnType<typeof vi.fn> } };
    }
  ).client;
}

describe('OpenAIEmbeddingProvider', () => {
  it('uses text-embedding-3-small as default model', () => {
    const provider = createProvider();
    expect(provider.modelId).toBe('text-embedding-3-small');
  });

  it('uses 1536 as default dimensions', () => {
    const provider = createProvider();
    expect(provider.dimensions).toBe(1536);
  });

  it('accepts custom model and dimensions', () => {
    const provider = createProvider({ model: 'text-embedding-3-large', dimensions: 3072 });
    expect(provider.modelId).toBe('text-embedding-3-large');
    expect(provider.dimensions).toBe(3072);
  });

  it('returns embeddings sorted by index', async () => {
    const provider = createProvider();
    const client = getClient(provider);

    client.embeddings.create.mockResolvedValue({
      data: [
        { index: 1, embedding: [0.2, 0.3] },
        { index: 0, embedding: [0.1, 0.4] },
      ],
    });

    const result = await provider.embed(['first', 'second']);
    expect(result).toEqual([
      [0.1, 0.4],
      [0.2, 0.3],
    ]);
  });

  it('passes model and dimensions to the API', async () => {
    const provider = createProvider({ model: 'text-embedding-3-large', dimensions: 256 });
    const client = getClient(provider);

    client.embeddings.create.mockResolvedValue({ data: [] });

    await provider.embed(['hello']);

    expect(client.embeddings.create).toHaveBeenCalledWith({
      model: 'text-embedding-3-large',
      input: ['hello'],
      dimensions: 256,
    });
  });

  it('passes the input texts as-is', async () => {
    const provider = createProvider();
    const client = getClient(provider);

    client.embeddings.create.mockResolvedValue({ data: [] });

    await provider.embed(['one', 'two', 'three']);

    expect(client.embeddings.create).toHaveBeenCalledWith(
      expect.objectContaining({ input: ['one', 'two', 'three'] }),
    );
  });
});
