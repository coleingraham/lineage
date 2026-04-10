import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OllamaEmbeddingProvider } from '../embedding.js';

function createProvider(options?: { baseURL?: string; dimensions?: number }) {
  return new OllamaEmbeddingProvider({
    model: 'nomic-embed-text',
    ...options,
  });
}

function mockFetchResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('OllamaEmbeddingProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes modelId and dimensions', () => {
    const provider = createProvider({ dimensions: 768 });
    expect(provider.modelId).toBe('nomic-embed-text');
    expect(provider.dimensions).toBe(768);
  });

  it('defaults dimensions to 0 when not specified', () => {
    const provider = createProvider();
    expect(provider.dimensions).toBe(0);
  });

  it('calls /api/embeddings for each text', async () => {
    const provider = createProvider();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse({ embedding: [0.1, 0.2] }))
      .mockResolvedValueOnce(mockFetchResponse({ embedding: [0.3, 0.4] }));

    const result = await provider.embed(['hello', 'world']);

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('sends model and prompt in the request body', async () => {
    const provider = createProvider();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockFetchResponse({ embedding: [0.1] }));

    await provider.embed(['test text']);

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ model: 'nomic-embed-text', prompt: 'test text' });
  });

  it('uses default base URL when none provided', async () => {
    const provider = createProvider();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockFetchResponse({ embedding: [0.1] }));

    await provider.embed(['test']);

    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:11434/api/embeddings');
  });

  it('uses custom base URL when provided', async () => {
    const provider = createProvider({ baseURL: 'http://myhost:8080' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockFetchResponse({ embedding: [0.1] }));

    await provider.embed(['test']);

    expect(fetchSpy.mock.calls[0][0]).toBe('http://myhost:8080/api/embeddings');
  });

  it('throws on non-ok response', async () => {
    const provider = createProvider();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as Response);

    await expect(provider.embed(['test'])).rejects.toThrow(
      'Ollama embeddings request failed: 500 Internal Server Error',
    );
  });
});
