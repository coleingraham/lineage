import { describe, it, expect, vi } from 'vitest';
import type { Config } from '../config.js';
import { createRepository } from '../factory.js';

const baseConfig: Config = {
  storage: { backend: 'memory' },
  llm: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  embedding: { enabled: false },
};

vi.mock('@lineage/adapter-sqlite', () => ({
  InMemoryRepository: class {
    async getTree() {
      return {};
    }
    async listTrees() {
      return [];
    }
    async putTree() {}
    async getNode() {
      return {};
    }
    async getNodes() {
      return [];
    }
    async putNode() {}
    async softDeleteNode() {}
    async updateNodeEmbedding() {}
  },
  SqliteRepository: class {
    constructor(public db: unknown) {}
    async getTree() {
      return {};
    }
    async listTrees() {
      return [];
    }
    async putTree() {}
    async getNode() {
      return {};
    }
    async getNodes() {
      return [];
    }
    async putNode() {}
    async softDeleteNode() {}
    async updateNodeEmbedding() {}
  },
}));

vi.mock('better-sqlite3', () => ({
  default: class {
    constructor(public path: string) {}
  },
}));

vi.mock('postgres', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  default: (url: string, opts: unknown) => ({ url }),
}));

vi.mock('@lineage/adapter-postgres', () => ({
  PostgresRepository: class {
    constructor(public sql: unknown) {}
    async migrate() {}
    async getTree() {
      return {};
    }
    async listTrees() {
      return [];
    }
    async putTree() {}
    async getNode() {
      return {};
    }
    async getNodes() {
      return [];
    }
    async putNode() {}
    async softDeleteNode() {}
    async updateNodeEmbedding() {}
  },
}));

describe('createRepository', () => {
  it('returns InMemoryRepository for memory backend', async () => {
    const repo = await createRepository(baseConfig);
    expect(repo).toBeDefined();
    expect(typeof repo.listTrees).toBe('function');
  });

  it('returns SqliteRepository for sqlite backend', async () => {
    const repo = await createRepository({
      ...baseConfig,
      storage: { backend: 'sqlite', path: ':memory:' },
    });
    expect(repo).toBeDefined();
    expect(typeof repo.listTrees).toBe('function');
  });

  it('returns PostgresRepository for postgres backend', async () => {
    const repo = await createRepository({
      ...baseConfig,
      storage: { backend: 'postgres', url: 'postgres://localhost/test', poolSize: 5 },
    });
    expect(repo).toBeDefined();
    expect(typeof repo.listTrees).toBe('function');
  });
});
