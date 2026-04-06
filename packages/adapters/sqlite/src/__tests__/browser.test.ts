import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, Tree } from '@lineage/core';

// ---------------------------------------------------------------------------
// sql.js mock
// ---------------------------------------------------------------------------

interface QueuedRow {
  [key: string]: unknown;
}

const rowQueue: QueuedRow[][] = [];

function enqueueRows(rows: QueuedRow[]): void {
  rowQueue.push(rows);
}

const mockDb = {
  run: vi.fn(),
  prepare: vi.fn().mockImplementation(() => {
    const rows = rowQueue.shift() ?? [];
    let index = 0;
    return {
      bind: vi.fn(),
      step: vi.fn().mockImplementation(() => {
        if (index < rows.length) {
          return true;
        }
        return false;
      }),
      getAsObject: vi.fn().mockImplementation(() => {
        return rows[index++];
      }),
      free: vi.fn(),
    };
  }),
  export: vi.fn().mockReturnValue(new Uint8Array(0)),
};

vi.mock('sql.js', () => ({
  default: vi.fn().mockResolvedValue({
    Database: class {
      run = mockDb.run;
      prepare = mockDb.prepare;
      export = mockDb.export;
    },
  }),
}));

// Import after mocks are set up
import { BrowserSqliteRepository } from '../browser.js';

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
    metadata: null,
    author: null,
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
    metadata: node.metadata ? JSON.stringify(node.metadata) : null,
    author: node.author,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrowserSqliteRepository', () => {
  let repo: BrowserSqliteRepository;

  beforeEach(async () => {
    rowQueue.length = 0;
    vi.clearAllMocks();
    repo = await BrowserSqliteRepository.create('test');
  });

  describe('create()', () => {
    it('runs PRAGMA and migrations', () => {
      expect(mockDb.run).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
      const migrationSql = mockDb.run.mock.calls[1][0] as string;
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS node_types');
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS trees');
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS nodes');
    });
  });

  describe('trees', () => {
    it('getTree returns a mapped tree', async () => {
      const tree = makeTree();
      enqueueRows([treeToRow(tree)]);
      const result = await repo.getTree('tree-1');
      expect(result).toEqual(tree);
    });

    it('getTree throws when not found', async () => {
      enqueueRows([]);
      await expect(repo.getTree('missing')).rejects.toThrow('Tree not found: missing');
    });

    it('listTrees returns all trees', async () => {
      const t1 = makeTree({ treeId: 'a' });
      const t2 = makeTree({ treeId: 'b' });
      enqueueRows([treeToRow(t1), treeToRow(t2)]);
      const result = await repo.listTrees();
      expect(result).toEqual([t1, t2]);
    });

    it('putTree calls run with correct parameters', async () => {
      const tree = makeTree();
      await repo.putTree(tree);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO trees'),
        [tree.treeId, tree.title, tree.createdAt, tree.rootNodeId],
      );
    });
  });

  describe('nodes', () => {
    it('getNode returns a mapped node', async () => {
      const node = makeNode();
      enqueueRows([nodeToRow(node)]);
      const result = await repo.getNode('node-1');
      expect(result).toEqual(node);
    });

    it('getNode throws when not found', async () => {
      enqueueRows([]);
      await expect(repo.getNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('getNodes returns all nodes for a tree', async () => {
      const n1 = makeNode({ nodeId: 'n1' });
      const n2 = makeNode({ nodeId: 'n2', type: 'ai', parentId: 'n1' });
      enqueueRows([nodeToRow(n1), nodeToRow(n2)]);
      const result = await repo.getNodes('tree-1');
      expect(result).toEqual([n1, n2]);
    });

    it('putNode calls run with boolean-to-int conversion', async () => {
      const node = makeNode({ isDeleted: true });
      await repo.putNode(node);
      expect(mockDb.run).toHaveBeenCalledWith(
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
          null, // metadata (JSON-serialized)
          node.author,
        ],
      );
    });

    it('softDeleteNode throws when not found', async () => {
      enqueueRows([]);
      await expect(repo.softDeleteNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('softDeleteNode issues an UPDATE when the node exists', async () => {
      enqueueRows([{ node_id: 'node-1' }]);
      await repo.softDeleteNode('node-1');
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE nodes SET is_deleted = 1'),
        ['node-1'],
      );
    });

    it('deleteTree throws when not found', async () => {
      enqueueRows([]);
      await expect(repo.deleteTree('missing')).rejects.toThrow('Tree not found: missing');
    });

    it('deleteTree deletes nodes then tree', async () => {
      enqueueRows([{ tree_id: 'tree-1' }]);
      await repo.deleteTree('tree-1');
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM nodes'),
        ['tree-1'],
      );
      expect(mockDb.run).toHaveBeenCalledWith(
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
      enqueueRows([nodeToRow(node)]);
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
