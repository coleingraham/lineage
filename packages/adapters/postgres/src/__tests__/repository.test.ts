import { describe, it, expect, vi } from 'vitest';
import type { Node, NodeRepository, Tree } from '@lineage/core';
import { PostgresRepository } from '../repository.js';

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    treeId: '550e8400-e29b-41d4-a716-446655440001',
    title: 'Test tree',
    createdAt: '2026-04-03T00:00:00.000Z',
    rootNodeId: '550e8400-e29b-41d4-a716-446655440000',
    contextSources: null,
    ...overrides,
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    nodeId: '550e8400-e29b-41d4-a716-446655440000',
    treeId: '550e8400-e29b-41d4-a716-446655440001',
    parentId: null,
    type: 'human',
    content: 'Hello',
    isDeleted: false,
    createdAt: '2026-04-03T00:00:00.000Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    metadata: null,
    author: null,
    ...overrides,
  };
}

/**
 * Creates a mock postgres.Sql tagged template function.
 * Returns the configured result and records calls for assertions.
 */
function createMockSql(result: Record<string, unknown>[] = []) {
  const rows = Object.assign([...result], { count: result.length });
  const calls: { strings: TemplateStringsArray; values: unknown[] }[] = [];

  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings, values });
      return Promise.resolve(rows);
    },
    {
      unsafe: vi.fn().mockResolvedValue(undefined),
    },
  );

  return { sql, calls, rows };
}

describe('PostgresRepository', () => {
  describe('implements NodeRepository', () => {
    it('satisfies the interface', () => {
      const { sql } = createMockSql();
      const repo: NodeRepository = new PostgresRepository(sql as never);
      expect(repo).toBeDefined();
    });
  });

  describe('getTree', () => {
    it('returns a tree when found', async () => {
      const { sql } = createMockSql([
        {
          tree_id: '550e8400-e29b-41d4-a716-446655440001',
          title: 'Test',
          created_at: '2026-04-03T00:00:00.000Z',
          root_node_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      ]);
      const repo = new PostgresRepository(sql as never);
      const tree = await repo.getTree('550e8400-e29b-41d4-a716-446655440001');
      expect(tree).toEqual(makeTree({ title: 'Test' }));
    });

    it('throws when tree not found', async () => {
      const { sql } = createMockSql([]);
      const repo = new PostgresRepository(sql as never);
      await expect(repo.getTree('missing')).rejects.toThrow('Tree not found: missing');
    });
  });

  describe('listTrees', () => {
    it('returns all trees', async () => {
      const { sql } = createMockSql([
        {
          tree_id: 'a',
          title: 'A',
          created_at: '2026-04-03T00:00:00.000Z',
          root_node_id: 'n-a',
        },
        {
          tree_id: 'b',
          title: 'B',
          created_at: '2026-04-03T00:00:00.000Z',
          root_node_id: 'n-b',
        },
      ]);
      const repo = new PostgresRepository(sql as never);
      const trees = await repo.listTrees();
      expect(trees).toHaveLength(2);
      expect(trees[0].treeId).toBe('a');
    });
  });

  describe('putTree', () => {
    it('calls sql with tree values', async () => {
      const { sql, calls } = createMockSql();
      const repo = new PostgresRepository(sql as never);
      const tree = makeTree();
      await repo.putTree(tree);
      expect(calls).toHaveLength(1);
      expect(calls[0].values).toContain(tree.treeId);
    });
  });

  describe('getNode', () => {
    it('returns a node when found', async () => {
      const { sql } = createMockSql([
        {
          node_id: '550e8400-e29b-41d4-a716-446655440000',
          tree_id: '550e8400-e29b-41d4-a716-446655440001',
          parent_id: null,
          type_name: 'human',
          content: 'Hello',
          is_deleted: false,
          created_at: '2026-04-03T00:00:00.000Z',
          model_name: null,
          provider: null,
          token_count: null,
          embedding_model: null,
          metadata: null,
          author: null,
        },
      ]);
      const repo = new PostgresRepository(sql as never);
      const node = await repo.getNode('550e8400-e29b-41d4-a716-446655440000');
      expect(node).toEqual(makeNode());
    });

    it('throws when node not found', async () => {
      const { sql } = createMockSql([]);
      const repo = new PostgresRepository(sql as never);
      await expect(repo.getNode('missing')).rejects.toThrow('Node not found: missing');
    });
  });

  describe('putNode', () => {
    it('calls sql with node values', async () => {
      const { sql, calls } = createMockSql();
      const repo = new PostgresRepository(sql as never);
      await repo.putNode(makeNode());
      expect(calls).toHaveLength(1);
      expect(calls[0].values).toContain(makeNode().nodeId);
    });
  });

  describe('softDeleteNode', () => {
    it('throws when node not found', async () => {
      const { sql } = createMockSql([]);
      const repo = new PostgresRepository(sql as never);
      await expect(repo.softDeleteNode('missing')).rejects.toThrow('Node not found: missing');
    });
  });

  describe('updateNodeEmbedding', () => {
    it('calls sql with vector string', async () => {
      const { sql, calls } = createMockSql();
      const repo = new PostgresRepository(sql as never);
      await repo.updateNodeEmbedding('node-1', [0.1, 0.2, 0.3], 'text-embedding-3-small');
      expect(calls).toHaveLength(1);
      expect(calls[0].values).toContain('[0.1,0.2,0.3]');
      expect(calls[0].values).toContain('text-embedding-3-small');
    });
  });

  describe('migrate', () => {
    it('calls sql.unsafe with migration SQL', async () => {
      const { sql } = createMockSql();
      const repo = new PostgresRepository(sql as never);
      await repo.migrate();
      expect(sql.unsafe).toHaveBeenCalledTimes(4);
    });
  });
});
