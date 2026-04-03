import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectStorageMode, createStorage } from '../storage.js';

// Mock the browser adapter so createStorage doesn't actually load wa-sqlite
vi.mock('@lineage/adapter-sqlite/browser', () => ({
  BrowserSqliteRepository: {
    create: vi.fn().mockResolvedValue({ _mock: true }),
  },
}));

describe('detectStorageMode', () => {
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
  });

  it('returns local mode when no server URL is stored', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: () => null },
      writable: true,
      configurable: true,
    });
    expect(detectStorageMode()).toEqual({ mode: 'local' });
  });

  it('returns remote mode when a server URL is stored', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: (key: string) => (key === 'lineage:serverUrl' ? 'http://localhost:3000' : null) },
      writable: true,
      configurable: true,
    });
    expect(detectStorageMode()).toEqual({
      mode: 'remote',
      serverUrl: 'http://localhost:3000',
    });
  });

  it('returns local mode when localStorage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(detectStorageMode()).toEqual({ mode: 'local' });
  });
});

describe('createStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a BrowserSqliteRepository in local mode', async () => {
    const repo = await createStorage({ mode: 'local' });
    expect(repo).toEqual({ _mock: true });
  });

  it('throws in remote mode (not yet implemented)', async () => {
    await expect(createStorage({ mode: 'remote', serverUrl: 'http://localhost:3000' })).rejects.toThrow(
      'Remote storage is not yet implemented',
    );
  });
});
