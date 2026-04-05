import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, Tree } from '@lineage/core';

// ---------------------------------------------------------------------------
// @tauri-apps/plugin-sql mock
// ---------------------------------------------------------------------------

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    execute: vi.fn().mockResolvedValue({ rowsAffected: 0 }),
    select: vi.fn().mockResolvedValue([]),
  };
  return { mockDb };
});

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue(mockDb),
  },
}));

// Import after mocks are set up
import { TauriSqliteRepository } from '../tauri.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    treeId: 'tree-1',
    title: 'Test tree',
    createdAt: '2026-04-03T00:00:00.000Z',
    rootNodeId: 'node-1',
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
    ...overrides,
  };
}

function treeToRow(tree: Tree) {
  return {
    tree_id: tree.treeId,
    title: tree.title,
    created_at: tree.createdAt,
    root_node_id: tree.rootNodeId,
  };
}

function nodeToRow(node: Node) {
  return {
    node_id: node.nodeId,
    tree_id: node.treeId,
    parent_id: node.parentId,
    type_name: node.type,
    content: node.content,
    is_deleted: node.isDeleted ? 1 : 0,
    created_at: node.createdAt,
    model_name: node.modelName,
    provider: node.provider,
    token_count: node.tokenCount,
    embedding_model: node.embeddingModel,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TauriSqliteRepository', () => {
  let repo: TauriSqliteRepository;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDb.execute.mockResolvedValue({ rowsAffected: 0 });
    mockDb.select.mockResolvedValue([]);
    repo = await TauriSqliteRepository.create();
  });

  describe('create()', () => {
    it('loads the database and enables foreign keys', async () => {
      const Database = (await import('@tauri-apps/plugin-sql')).default;
      expect(Database.load).toHaveBeenCalledWith('sqlite:lineage.db');
      expect(mockDb.execute).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
    });

    it('runs migration statements', () => {
      const calls = mockDb.execute.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS node_types'))).toBe(true);
      expect(calls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS trees'))).toBe(true);
      expect(calls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS nodes'))).toBe(true);
    });

    it('accepts a custom database path', async () => {
      const Database = (await import('@tauri-apps/plugin-sql')).default;
      vi.mocked(Database.load).mockClear();
      await TauriSqliteRepository.create('sqlite:custom.db');
      expect(Database.load).toHaveBeenCalledWith('sqlite:custom.db');
    });
  });

  describe('trees', () => {
    it('getTree returns a mapped tree', async () => {
      const tree = makeTree();
      mockDb.select.mockResolvedValueOnce([treeToRow(tree)]);
      const result = await repo.getTree('tree-1');
      expect(result).toEqual(tree);
    });

    it('getTree throws when not found', async () => {
      mockDb.select.mockResolvedValueOnce([]);
      await expect(repo.getTree('missing')).rejects.toThrow('Tree not found: missing');
    });

    it('listTrees returns all trees', async () => {
      const t1 = makeTree({ treeId: 'a' });
      const t2 = makeTree({ treeId: 'b' });
      mockDb.select.mockResolvedValueOnce([treeToRow(t1), treeToRow(t2)]);
      const result = await repo.listTrees();
      expect(result).toEqual([t1, t2]);
    });

    it('putTree calls execute with correct parameters', async () => {
      const tree = makeTree();
      await repo.putTree(tree);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trees'),
        [tree.treeId, tree.title, tree.createdAt, tree.rootNodeId],
      );
    });
  });

  describe('nodes', () => {
    it('getNode returns a mapped node', async () => {
      const node = makeNode();
      mockDb.select.mockResolvedValueOnce([nodeToRow(node)]);
      const result = await repo.getNode('node-1');
      expect(result).toEqual(node);
    });

    it('getNode throws when not found', async () => {
      mockDb.select.mockResolvedValueOnce([]);
      await expect(repo.getNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('getNodes returns all nodes for a tree', async () => {
      const n1 = makeNode({ nodeId: 'n1' });
      const n2 = makeNode({ nodeId: 'n2', type: 'ai', parentId: 'n1' });
      mockDb.select.mockResolvedValueOnce([nodeToRow(n1), nodeToRow(n2)]);
      const result = await repo.getNodes('tree-1');
      expect(result).toEqual([n1, n2]);
    });

    it('putNode calls execute with boolean-to-int conversion', async () => {
      const node = makeNode({ isDeleted: true });
      await repo.putNode(node);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO nodes'),
        [
          node.nodeId,
          node.treeId,
          node.parentId,
          node.type,
          node.content,
          1, // isDeleted mapped to integer
          node.createdAt,
          node.modelName,
          node.provider,
          node.tokenCount,
          node.embeddingModel,
        ],
      );
    });

    it('softDeleteNode throws when not found', async () => {
      mockDb.select.mockResolvedValueOnce([]);
      await expect(repo.softDeleteNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('softDeleteNode issues an UPDATE when the node exists', async () => {
      mockDb.select.mockResolvedValueOnce([{ node_id: 'node-1' }]);
      await repo.softDeleteNode('node-1');
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE nodes SET is_deleted = 1'),
        ['node-1'],
      );
    });

    it('deleteTree throws when not found', async () => {
      mockDb.select.mockResolvedValueOnce([]);
      await expect(repo.deleteTree('missing')).rejects.toThrow('Tree not found: missing');
    });

    it('deleteTree deletes nodes then tree', async () => {
      mockDb.select.mockResolvedValueOnce([{ tree_id: 'tree-1' }]);
      await repo.deleteTree('tree-1');
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM nodes'),
        ['tree-1'],
      );
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM trees'),
        ['tree-1'],
      );
    });

    it('round-trips an ai node with all metadata', async () => {
      const node = makeNode({
        nodeId: 'ai-1',
        parentId: 'node-1',
        type: 'ai',
        modelName: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        tokenCount: 42,
        embeddingModel: 'text-embedding-3-small',
      });
      mockDb.select.mockResolvedValueOnce([nodeToRow(node)]);
      const result = await repo.getNode('ai-1');
      expect(result).toEqual(node);
    });
  });

  describe('updateNodeEmbedding', () => {
    it('is a silent no-op', async () => {
      await expect(repo.updateNodeEmbedding('any', [1, 2, 3], 'model')).resolves.toBeUndefined();
    });
  });
});
