import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import postgres from 'postgres';
import type { Node, Tree } from '../types.js';
import type { NodeRepository } from '../repository.js';
import { InMemoryRepository } from '../../../adapters/sqlite/src/memory.js';
import { SqliteRepository } from '../../../adapters/sqlite/src/server.js';
import { PostgresRepository } from '../../../adapters/postgres/src/repository.js';

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    treeId: 'tree-1',
    title: 'Test tree',
    createdAt: '2026-04-03T00:00:00.000Z',
    rootNodeId: 'node-root',
    ...overrides,
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    nodeId: 'node-1',
    treeId: 'tree-1',
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

interface RepositoryFixture {
  name: string;
  create: () => Promise<NodeRepository>;
  cleanup?: () => Promise<void>;
  supportsEmbeddings: boolean;
  supportsConcurrentWrites: boolean;
}

const POSTGRES_URL = process.env.LINEAGE_POSTGRES_URL;

const fixtures: RepositoryFixture[] = [
  {
    name: 'InMemoryRepository',
    create: async () => new InMemoryRepository(),
    supportsEmbeddings: false,
    supportsConcurrentWrites: false,
  },
  {
    name: 'SqliteRepository',
    create: async () => {
      const db = new Database(':memory:');
      return new SqliteRepository(db);
    },
    supportsEmbeddings: false,
    supportsConcurrentWrites: false,
  },
];

if (POSTGRES_URL) {
  let sql: postgres.Sql;

  fixtures.push({
    name: 'PostgresRepository',
    create: async () => {
      sql = postgres(POSTGRES_URL);
      // Drop and recreate tables for a clean state
      await sql.unsafe(`
        DROP TABLE IF EXISTS nodes CASCADE;
        DROP TABLE IF EXISTS trees CASCADE;
        DROP TABLE IF EXISTS node_types CASCADE;
      `);
      const repo = new PostgresRepository(sql);
      await repo.migrate();
      return repo;
    },
    cleanup: async () => {
      if (sql) await sql.end();
    },
    supportsEmbeddings: true,
    supportsConcurrentWrites: true,
  });
}

describe.each(fixtures)('NodeRepository contract — $name', (fixture) => {
  let repo: NodeRepository;

  beforeEach(async () => {
    repo = await fixture.create();
  });

  afterAll(async () => {
    await fixture.cleanup?.();
  });

  // ---------------------------------------------------------------------------
  // Tree CRUD
  // ---------------------------------------------------------------------------
  describe('tree CRUD', () => {
    it('puts and gets a tree', async () => {
      const tree = makeTree();
      await repo.putTree(tree);
      expect(await repo.getTree('tree-1')).toEqual(tree);
    });

    it('throws on missing tree', async () => {
      await expect(repo.getTree('missing')).rejects.toThrow('Tree not found: missing');
    });

    it('lists all trees', async () => {
      await repo.putTree(makeTree({ treeId: 'a', rootNodeId: 'n-a' }));
      await repo.putTree(makeTree({ treeId: 'b', rootNodeId: 'n-b' }));
      const trees = await repo.listTrees();
      expect(trees).toHaveLength(2);
    });

    it('returns empty array when no trees exist', async () => {
      expect(await repo.listTrees()).toEqual([]);
    });

    it('upserts a tree with the same id', async () => {
      await repo.putTree(makeTree({ title: 'v1' }));
      await repo.putTree(makeTree({ title: 'v2' }));
      expect((await repo.getTree('tree-1')).title).toBe('v2');
    });
  });

  // ---------------------------------------------------------------------------
  // Node CRUD
  // ---------------------------------------------------------------------------
  describe('node CRUD', () => {
    beforeEach(async () => {
      await repo.putTree(makeTree());
    });

    it('puts and gets a node', async () => {
      const node = makeNode();
      await repo.putNode(node);
      expect(await repo.getNode('node-1')).toEqual(node);
    });

    it('throws on missing node', async () => {
      await expect(repo.getNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('gets nodes by treeId', async () => {
      await repo.putTree(makeTree({ treeId: 'tree-2', rootNodeId: 'n3' }));
      await repo.putNode(makeNode({ nodeId: 'n1', treeId: 'tree-1' }));
      await repo.putNode(makeNode({ nodeId: 'n2', treeId: 'tree-1' }));
      await repo.putNode(makeNode({ nodeId: 'n3', treeId: 'tree-2' }));
      expect(await repo.getNodes('tree-1')).toHaveLength(2);
      expect(await repo.getNodes('tree-2')).toHaveLength(1);
    });

    it('returns empty array for tree with no nodes', async () => {
      expect(await repo.getNodes('tree-1')).toEqual([]);
    });

    it('upserts a node with the same id', async () => {
      await repo.putNode(makeNode({ content: 'v1' }));
      await repo.putNode(makeNode({ content: 'v2' }));
      expect((await repo.getNode('node-1')).content).toBe('v2');
    });

    it('round-trips an ai node with all metadata', async () => {
      const root = makeNode({ nodeId: 'node-root' });
      await repo.putNode(root);
      const node = makeNode({
        nodeId: 'ai-1',
        parentId: 'node-root',
        type: 'ai',
        modelName: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        tokenCount: 42,
        embeddingModel: 'text-embedding-3-small',
      });
      await repo.putNode(node);
      expect(await repo.getNode('ai-1')).toEqual(node);
    });
  });

  // ---------------------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------------------
  describe('soft delete', () => {
    beforeEach(async () => {
      await repo.putTree(makeTree());
    });

    it('marks a node as deleted', async () => {
      await repo.putNode(makeNode());
      await repo.softDeleteNode('node-1');
      const node = await repo.getNode('node-1');
      expect(node.isDeleted).toBe(true);
    });

    it('throws when soft deleting a missing node', async () => {
      await expect(repo.softDeleteNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('preserves soft-deleted node in getNodes results', async () => {
      await repo.putNode(makeNode({ nodeId: 'n1' }));
      await repo.putNode(makeNode({ nodeId: 'n2' }));
      await repo.softDeleteNode('n1');
      const nodes = await repo.getNodes('tree-1');
      expect(nodes).toHaveLength(2);
      expect(nodes.find((n) => n.nodeId === 'n1')?.isDeleted).toBe(true);
      expect(nodes.find((n) => n.nodeId === 'n2')?.isDeleted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Parent-child relationships
  // ---------------------------------------------------------------------------
  describe('parent-child relationships', () => {
    beforeEach(async () => {
      await repo.putTree(makeTree());
    });

    it('stores and retrieves parentId', async () => {
      const root = makeNode({ nodeId: 'root', parentId: null });
      const child = makeNode({ nodeId: 'child', parentId: 'root' });
      await repo.putNode(root);
      await repo.putNode(child);

      expect((await repo.getNode('root')).parentId).toBeNull();
      expect((await repo.getNode('child')).parentId).toBe('root');
    });

    it('supports multi-level parent chains', async () => {
      await repo.putNode(makeNode({ nodeId: 'n1', parentId: null }));
      await repo.putNode(makeNode({ nodeId: 'n2', parentId: 'n1' }));
      await repo.putNode(makeNode({ nodeId: 'n3', parentId: 'n2' }));

      const nodes = await repo.getNodes('tree-1');
      expect(nodes).toHaveLength(3);
      expect(nodes.find((n) => n.nodeId === 'n3')?.parentId).toBe('n2');
    });

    it('supports branching (multiple children with the same parent)', async () => {
      await repo.putNode(makeNode({ nodeId: 'root', parentId: null }));
      await repo.putNode(makeNode({ nodeId: 'branch-a', parentId: 'root' }));
      await repo.putNode(makeNode({ nodeId: 'branch-b', parentId: 'root' }));

      const branchA = await repo.getNode('branch-a');
      const branchB = await repo.getNode('branch-b');
      expect(branchA.parentId).toBe('root');
      expect(branchB.parentId).toBe('root');
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrent writes (where applicable)
  // ---------------------------------------------------------------------------
  describe('concurrent writes', () => {
    beforeEach(async () => {
      await repo.putTree(makeTree());
    });

    it('handles concurrent putNode calls without errors', async () => {
      const nodes = Array.from({ length: 10 }, (_, i) =>
        makeNode({ nodeId: `concurrent-${i}`, content: `message ${i}` }),
      );
      await Promise.all(nodes.map((n) => repo.putNode(n)));
      const stored = await repo.getNodes('tree-1');
      expect(stored).toHaveLength(10);
    });

    it('handles concurrent putTree calls without errors', async () => {
      const trees = Array.from({ length: 10 }, (_, i) =>
        makeTree({ treeId: `t-${i}`, rootNodeId: `r-${i}` }),
      );
      await Promise.all(trees.map((t) => repo.putTree(t)));
      const stored = await repo.listTrees();
      // +1 for the tree created in beforeEach
      expect(stored).toHaveLength(11);
    });

    it('last write wins on concurrent upserts to the same node', async () => {
      await repo.putNode(makeNode({ nodeId: 'race', content: 'initial' }));
      // Fire concurrent updates — the final state should reflect one of them
      await Promise.all([
        repo.putNode(makeNode({ nodeId: 'race', content: 'writer-a' })),
        repo.putNode(makeNode({ nodeId: 'race', content: 'writer-b' })),
      ]);
      const node = await repo.getNode('race');
      expect(['writer-a', 'writer-b']).toContain(node.content);
    });
  });

  // ---------------------------------------------------------------------------
  // updateNodeEmbedding
  // ---------------------------------------------------------------------------
  describe('updateNodeEmbedding', () => {
    if (fixture.supportsEmbeddings) {
      beforeEach(async () => {
        await repo.putTree(makeTree());
        await repo.putNode(makeNode());
      });

      it('updates the embedding model on the node', async () => {
        await repo.updateNodeEmbedding('node-1', [0.1, 0.2, 0.3], 'text-embedding-3-small');
        const node = await repo.getNode('node-1');
        expect(node.embeddingModel).toBe('text-embedding-3-small');
      });
    } else {
      it('does not throw (no-op on non-embedding backends)', async () => {
        await expect(
          repo.updateNodeEmbedding('any-id', [1, 2, 3], 'model'),
        ).resolves.toBeUndefined();
      });
    }
  });
});
