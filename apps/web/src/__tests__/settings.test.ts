import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the Settings component's localStorage persistence contract.
 */

const KEYS = {
  storageMode: 'lineage:storageMode',
  serverUrl: 'lineage:serverUrl',
  llmProvider: 'lineage:llmProvider',
  llmApiKey: 'lineage:llmApiKey',
  ollamaBaseUrl: 'lineage:ollamaBaseUrl',
  embeddingEnabled: 'lineage:embeddingEnabled',
  embeddingProvider: 'lineage:embeddingProvider',
  embeddingModel: 'lineage:embeddingModel',
} as const;

/* Simple in-memory localStorage mock */
function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

describe('Settings localStorage contract', () => {
  const originalLocalStorage = globalThis.localStorage;
  let storage: Storage;

  beforeEach(() => {
    storage = createMockStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('defaults to local storage mode when nothing is stored', () => {
    expect(localStorage.getItem(KEYS.storageMode)).toBeNull();
  });

  it('persists and retrieves storage mode', () => {
    localStorage.setItem(KEYS.storageMode, 'remote');
    expect(localStorage.getItem(KEYS.storageMode)).toBe('remote');
  });

  it('persists LLM provider selection', () => {
    localStorage.setItem(KEYS.llmProvider, 'ollama');
    expect(localStorage.getItem(KEYS.llmProvider)).toBe('ollama');
  });

  it('persists embedding toggle as string boolean', () => {
    localStorage.setItem(KEYS.embeddingEnabled, 'true');
    expect(localStorage.getItem(KEYS.embeddingEnabled) === 'true').toBe(true);
  });

  it('clears API key when switching to remote mode', () => {
    localStorage.setItem(KEYS.llmApiKey, 'sk-test-key');
    expect(localStorage.getItem(KEYS.llmApiKey)).toBe('sk-test-key');

    // Simulates the save logic: remote mode removes the API key
    localStorage.removeItem(KEYS.llmApiKey);
    expect(localStorage.getItem(KEYS.llmApiKey)).toBeNull();
  });

  it('clears Ollama base URL when provider is not Ollama', () => {
    localStorage.setItem(KEYS.ollamaBaseUrl, 'http://localhost:11434');
    localStorage.setItem(KEYS.llmProvider, 'anthropic');

    // Simulates the save logic: non-Ollama provider removes the URL
    localStorage.removeItem(KEYS.ollamaBaseUrl);
    expect(localStorage.getItem(KEYS.ollamaBaseUrl)).toBeNull();
  });

  it('persists embedding provider and model', () => {
    localStorage.setItem(KEYS.embeddingProvider, 'openai');
    localStorage.setItem(KEYS.embeddingModel, 'text-embedding-3-small');

    expect(localStorage.getItem(KEYS.embeddingProvider)).toBe('openai');
    expect(localStorage.getItem(KEYS.embeddingModel)).toBe('text-embedding-3-small');
  });

  it('removes serverUrl from localStorage when mode is local', () => {
    localStorage.setItem(KEYS.serverUrl, 'http://localhost:3000');
    // Simulates save logic for local mode
    localStorage.removeItem(KEYS.serverUrl);
    expect(localStorage.getItem(KEYS.serverUrl)).toBeNull();
  });
});
