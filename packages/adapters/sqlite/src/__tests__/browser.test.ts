import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, Tree } from '@lineage/core';

// ---------------------------------------------------------------------------
// wa-sqlite mock
// ---------------------------------------------------------------------------

interface QueuedResult {
  columns: string[];
  rows: unknown[][];
}

const resultQueue: QueuedResult[] = [];
let currentResult: QueuedResult | undefined;
let currentRowIndex = 0;

function enqueue(columns: string[], rows: unknown[][]): void {
  resultQueue.push({ columns, rows });
}

const mockAPI = {
  open_v2: vi.fn().mockResolvedValue(1),
  close: vi.fn().mockResolvedValue(0),
  exec: vi.fn().mockResolvedValue(0),
  vfs_register: vi.fn().mockReturnValue(0),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  statements: vi.fn().mockImplementation((_db: number, _sql: string) => ({
    [Symbol.asyncIterator]: async function* () {
      currentResult = resultQueue.shift() ?? { columns: [], rows: [] };
      currentRowIndex = 0;
      yield 1;
    },
  })),
  bind: vi.fn().mockReturnValue(0),
  step: vi.fn().mockImplementation(async () => {
    if (currentResult && currentRowIndex < currentResult.rows.length) {
      return 100; // SQLITE_ROW
    }
    return 101; // SQLITE_DONE
  }),
  column_names: vi.fn().mockImplementation(() => currentResult?.columns ?? []),
  row: vi.fn().mockImplementation(() => {
    const r = currentResult?.rows[currentRowIndex];
    currentRowIndex++;
    return r ?? [];
  }),
  reset: vi.fn().mockReturnValue(0),
  finalize: vi.fn().mockReturnValue(0),
};

vi.mock('wa-sqlite', () => ({
  SQLITE_ROW: 100,
  SQLITE_DONE: 101,
  Factory: () => mockAPI,
}));

vi.mock('wa-sqlite/dist/wa-sqlite-async.mjs', () => ({
  default: () => Promise.resolve({}),
}));

vi.mock('wa-sqlite/src/vfs/OPFSAnyContextVFS.js', () => ({
  OPFSAnyContextVFS: {
    create: () => Promise.resolve({}),
  },
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
    ...overrides,
  };
}

const TREE_COLUMNS = ['tree_id', 'title', 'created_at', 'root_node_id'];
const NODE_COLUMNS = [
  'node_id',
  'tree_id',
  'parent_id',
  'type_name',
  'content',
  'is_deleted',
  'created_at',
  'model_name',
  'provider',
  'token_count',
  'embedding_model',
];

function treeToRow(tree: Tree): unknown[] {
  return [tree.treeId, tree.title, tree.createdAt, tree.rootNodeId];
}

function nodeToRow(node: Node): unknown[] {
  return [
    node.nodeId,
    node.treeId,
    node.parentId,
    node.type,
    node.content,
    node.isDeleted ? 1 : 0,
    node.createdAt,
    node.modelName,
    node.provider,
    node.tokenCount,
    node.embeddingModel,
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrowserSqliteRepository', () => {
  let repo: BrowserSqliteRepository;

  beforeEach(async () => {
    resultQueue.length = 0;
    currentResult = undefined;
    currentRowIndex = 0;
    vi.clearAllMocks();
    repo = await BrowserSqliteRepository.create('test');
  });

  describe('create()', () => {
    it('registers the OPFS VFS and opens the database', () => {
      expect(mockAPI.vfs_register).toHaveBeenCalledWith(expect.anything(), true);
      expect(mockAPI.open_v2).toHaveBeenCalledWith('test.db');
    });

    it('enables foreign keys and runs migrations', () => {
      expect(mockAPI.exec).toHaveBeenCalledWith(1, 'PRAGMA foreign_keys = ON');
      // Second exec call is the migration SQL
      expect(mockAPI.exec).toHaveBeenCalledTimes(2);
      const migrationSql = mockAPI.exec.mock.calls[1][1] as string;
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS node_types');
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS trees');
      expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS nodes');
    });
  });

  describe('trees', () => {
    it('getTree returns a mapped tree', async () => {
      const tree = makeTree();
      enqueue(TREE_COLUMNS, [treeToRow(tree)]);
      const result = await repo.getTree('tree-1');
      expect(result).toEqual(tree);
    });

    it('getTree throws when not found', async () => {
      enqueue(TREE_COLUMNS, []);
      await expect(repo.getTree('missing')).rejects.toThrow('Tree not found: missing');
    });

    it('listTrees returns all trees', async () => {
      const t1 = makeTree({ treeId: 'a' });
      const t2 = makeTree({ treeId: 'b' });
      enqueue(TREE_COLUMNS, [treeToRow(t1), treeToRow(t2)]);
      const result = await repo.listTrees();
      expect(result).toEqual([t1, t2]);
    });

    it('putTree binds correct parameters', async () => {
      const tree = makeTree();
      enqueue([], []);
      await repo.putTree(tree);
      expect(mockAPI.bind).toHaveBeenCalledWith(
        1,
        [tree.treeId, tree.title, tree.createdAt, tree.rootNodeId],
      );
    });
  });

  describe('nodes', () => {
    it('getNode returns a mapped node', async () => {
      const node = makeNode();
      enqueue(NODE_COLUMNS, [nodeToRow(node)]);
      const result = await repo.getNode('node-1');
      expect(result).toEqual(node);
    });

    it('getNode throws when not found', async () => {
      enqueue(NODE_COLUMNS, []);
      await expect(repo.getNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('getNodes returns all nodes for a tree', async () => {
      const n1 = makeNode({ nodeId: 'n1' });
      const n2 = makeNode({ nodeId: 'n2', type: 'ai', parentId: 'n1' });
      enqueue(NODE_COLUMNS, [nodeToRow(n1), nodeToRow(n2)]);
      const result = await repo.getNodes('tree-1');
      expect(result).toEqual([n1, n2]);
    });

    it('putNode binds correct parameters including boolean-to-int conversion', async () => {
      const node = makeNode({ isDeleted: true });
      enqueue([], []);
      await repo.putNode(node);
      expect(mockAPI.bind).toHaveBeenCalledWith(1, [
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
      ]);
    });

    it('softDeleteNode throws when not found', async () => {
      enqueue(['node_id'], []);
      await expect(repo.softDeleteNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('softDeleteNode issues an UPDATE when the node exists', async () => {
      // First query: existence check
      enqueue(['node_id'], [['node-1']]);
      // Second query: the UPDATE
      enqueue([], []);
      await repo.softDeleteNode('node-1');
      const updateCall = mockAPI.statements.mock.calls.find(
        (c: unknown[]) => typeof c[1] === 'string' && c[1].includes('UPDATE nodes'),
      );
      expect(updateCall).toBeDefined();
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
      enqueue(NODE_COLUMNS, [nodeToRow(node)]);
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
