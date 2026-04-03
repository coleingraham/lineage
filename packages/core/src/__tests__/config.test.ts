import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseConfig } from '../config.js';

const validConfig = {
  storage: { backend: 'memory' as const },
  llm: { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' },
  embedding: { enabled: false },
};

describe('parseConfig', () => {
  it('accepts a valid memory config', () => {
    const result = parseConfig(validConfig);
    expect(result.storage.backend).toBe('memory');
  });

  it('accepts a valid sqlite config', () => {
    const result = parseConfig({
      ...validConfig,
      storage: { backend: 'sqlite', path: './data.db' },
    });
    expect(result.storage).toEqual({ backend: 'sqlite', path: './data.db' });
  });

  it('accepts a valid postgres config with default poolSize', () => {
    const result = parseConfig({
      ...validConfig,
      storage: { backend: 'postgres', url: 'postgres://localhost/lineage' },
    });
    expect(result.storage).toEqual({
      backend: 'postgres',
      url: 'postgres://localhost/lineage',
      poolSize: 10,
    });
  });

  it('rejects unknown top-level keys', () => {
    expect(() => parseConfig({ ...validConfig, unknownKey: true })).toThrow('Unknown key');
  });

  it('rejects invalid storage backend', () => {
    expect(() => parseConfig({ ...validConfig, storage: { backend: 'redis' } })).toThrow(
      'must be one of',
    );
  });

  it('defaults embedding.enabled to false', () => {
    const result = parseConfig({
      storage: { backend: 'memory' },
      llm: { provider: 'openai', model: 'gpt-4' },
      embedding: {},
    });
    expect(result.embedding.enabled).toBe(false);
  });

  it('rejects unknown keys inside storage', () => {
    expect(() =>
      parseConfig({ ...validConfig, storage: { backend: 'memory', extra: true } }),
    ).toThrow('Unknown key "extra" in storage');
  });

  it('rejects unknown keys inside llm', () => {
    expect(() =>
      parseConfig({
        ...validConfig,
        llm: { provider: 'anthropic', model: 'x', unknown: 1 },
      }),
    ).toThrow('Unknown key "unknown" in llm');
  });
});

describe('env var interpolation', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.TEST_DB_URL = process.env.TEST_DB_URL;
    savedEnv.TEST_API_KEY = process.env.TEST_API_KEY;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('resolves ${ENV_VAR} in string values', () => {
    process.env.TEST_DB_URL = 'postgres://localhost/test';
    const result = parseConfig({
      ...validConfig,
      storage: { backend: 'postgres', url: '${TEST_DB_URL}' },
    });
    expect(result.storage).toEqual({
      backend: 'postgres',
      url: 'postgres://localhost/test',
      poolSize: 10,
    });
  });

  it('resolves multiple env vars in one string', () => {
    process.env.TEST_DB_URL = 'localhost';
    process.env.TEST_API_KEY = '5432';
    const result = parseConfig({
      ...validConfig,
      storage: { backend: 'postgres', url: 'postgres://${TEST_DB_URL}:${TEST_API_KEY}/db' },
    });
    expect((result.storage as { url: string }).url).toBe('postgres://localhost:5432/db');
  });

  it('throws when referenced env var is not set', () => {
    delete process.env.MISSING_VAR;
    expect(() =>
      parseConfig({
        ...validConfig,
        llm: { provider: 'anthropic', model: 'x', apiKey: '${MISSING_VAR}' },
      }),
    ).toThrow('Environment variable "MISSING_VAR" is not set');
  });

  it('passes through non-string values unchanged', () => {
    const result = parseConfig({
      ...validConfig,
      storage: { backend: 'postgres', url: 'postgres://localhost/db', poolSize: 20 },
    });
    expect((result.storage as { poolSize: number }).poolSize).toBe(20);
  });
});
