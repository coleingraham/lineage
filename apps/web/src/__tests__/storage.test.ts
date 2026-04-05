import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectStorageMode, createStorage } from '../storage.js';

// Mock the browser adapter so createStorage doesn't actually load wa-sqlite
vi.mock('@lineage/adapter-sqlite/browser', () => ({
  BrowserSqliteRepository: {
    create: vi.fn().mockResolvedValue({ _mock: true }),
  },
}));

// Mock the SDK so createStorage doesn't actually make HTTP requests
vi.mock('@lineage/sdk', () => ({
  RestNodeRepository: class {
    baseUrl: string;
    _mock = true;
    constructor(opts: { baseUrl: string }) {
      this.baseUrl = opts.baseUrl;
    }
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

  it('defaults to remote mode with localhost:3000 when no settings exist', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: () => null },
      writable: true,
      configurable: true,
    });
    expect(detectStorageMode()).toEqual({ mode: 'remote', serverUrl: 'http://localhost:3000' });
  });

  it('returns local mode when storageMode is explicitly set to local', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => (key === 'lineage:storageMode' ? 'local' : null),
      },
      writable: true,
      configurable: true,
    });
    expect(detectStorageMode()).toEqual({ mode: 'local' });
  });

  it('returns remote mode with stored server URL', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => (key === 'lineage:serverUrl' ? 'http://example.com' : null),
      },
      writable: true,
      configurable: true,
    });
    expect(detectStorageMode()).toEqual({
      mode: 'remote',
      serverUrl: 'http://example.com',
    });
  });

  it('defaults to remote mode when localStorage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(detectStorageMode()).toEqual({ mode: 'remote', serverUrl: 'http://localhost:3000' });
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

  it('creates a RestNodeRepository in remote mode', async () => {
    const repo = await createStorage({ mode: 'remote', serverUrl: 'http://localhost:3000' });
    expect(repo).toEqual({ _mock: true, baseUrl: 'http://localhost:3000' });
  });
});
