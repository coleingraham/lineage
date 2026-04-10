import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmbeddingJob } from '../embeddingJob.js';
import type { NodeRepository } from '../repository.js';
import type { EmbeddingProvider } from '../embedding.js';
import type { Node, Tree } from '../types.js';

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    nodeId: 'node-1',
    treeId: 'tree-1',
    parentId: null,
    type: 'human',
    content: 'hello world',
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    metadata: null,
    author: null,
    ...overrides,
  };
}

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    treeId: 'tree-1',
    title: 'Test Tree',
    createdAt: '2026-01-01T00:00:00Z',
    rootNodeId: 'node-1',
    contextSources: null,
    ...overrides,
  };
}

function mockProvider(overrides: Partial<EmbeddingProvider> = {}): EmbeddingProvider {
  return {
    modelId: 'text-embedding-3-small',
    dimensions: 1536,
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
    ...overrides,
  };
}

function mockRepository(
  trees: Tree[] = [],
  nodesByTree: Record<string, Node[]> = {},
): NodeRepository {
  return {
    listTrees: vi.fn(async () => trees),
    getNodes: vi.fn(async (treeId: string) => nodesByTree[treeId] ?? []),
    updateNodeEmbedding: vi.fn(async () => {}),
    // Unused stubs
    getTree: vi.fn(),
    putTree: vi.fn(),
    getNode: vi.fn(),
    putNode: vi.fn(),
    softDeleteNode: vi.fn(),
    deleteTree: vi.fn(),
    semanticSearch: vi.fn(),
    searchNodes: vi.fn(),
    searchTrees: vi.fn(),
    createCategory: vi.fn(),
    getCategory: vi.fn(),
    listCategories: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createTag: vi.fn(),
    getTag: vi.fn(),
    listTags: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
    tagNode: vi.fn(),
    untagNode: vi.fn(),
    getNodeTags: vi.fn(),
    tagTree: vi.fn(),
    untagTree: vi.fn(),
    getTreeTags: vi.fn(),
    findNodesByTags: vi.fn(),
    findTreesByTags: vi.fn(),
  };
}

describe('createEmbeddingJob', () => {
  let provider: EmbeddingProvider;
  let repo: NodeRepository;

  beforeEach(() => {
    provider = mockProvider();
    repo = mockRepository();
  });

  it('returns 0 when there are no trees', async () => {
    const job = createEmbeddingJob({ repository: repo, provider });
    const count = await job.tick();
    expect(count).toBe(0);
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('embeds nodes that have no embeddingModel set', async () => {
    const tree = makeTree();
    const node = makeNode();
    repo = mockRepository([tree], { 'tree-1': [node] });
    const job = createEmbeddingJob({ repository: repo, provider });

    const count = await job.tick();

    expect(count).toBe(1);
    expect(provider.embed).toHaveBeenCalledWith(['hello world']);
    expect(repo.updateNodeEmbedding).toHaveBeenCalledWith(
      'node-1',
      [0.1, 0.2, 0.3],
      'text-embedding-3-small',
    );
  });

  it('skips nodes already embedded with the current model', async () => {
    const tree = makeTree();
    const node = makeNode({ embeddingModel: 'text-embedding-3-small' });
    repo = mockRepository([tree], { 'tree-1': [node] });
    const job = createEmbeddingJob({ repository: repo, provider });

    const count = await job.tick();

    expect(count).toBe(0);
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('re-embeds nodes when the model has changed', async () => {
    const tree = makeTree();
    const node = makeNode({ embeddingModel: 'old-model' });
    repo = mockRepository([tree], { 'tree-1': [node] });
    const job = createEmbeddingJob({ repository: repo, provider });

    const count = await job.tick();

    expect(count).toBe(1);
    expect(provider.embed).toHaveBeenCalledWith(['hello world']);
  });

  it('skips deleted nodes', async () => {
    const tree = makeTree();
    const node = makeNode({ isDeleted: true });
    repo = mockRepository([tree], { 'tree-1': [node] });
    const job = createEmbeddingJob({ repository: repo, provider });

    const count = await job.tick();

    expect(count).toBe(0);
  });

  it('respects batchSize limit', async () => {
    const tree = makeTree();
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode({ nodeId: `node-${i}`, content: `text ${i}` }),
    );
    repo = mockRepository([tree], { 'tree-1': nodes });
    const job = createEmbeddingJob({ repository: repo, provider, batchSize: 3 });

    const count = await job.tick();

    expect(count).toBe(3);
    expect(provider.embed).toHaveBeenCalledWith(['text 0', 'text 1', 'text 2']);
  });

  it('start/stop controls the polling interval', async () => {
    vi.useFakeTimers();
    try {
      const job = createEmbeddingJob({ repository: repo, provider, intervalMs: 1000 });

      job.start();
      await vi.advanceTimersByTimeAsync(2500);
      expect(repo.listTrees).toHaveBeenCalledTimes(2);

      job.stop();
      await vi.advanceTimersByTimeAsync(2000);
      expect(repo.listTrees).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('start is idempotent', async () => {
    vi.useFakeTimers();
    try {
      const job = createEmbeddingJob({ repository: repo, provider, intervalMs: 1000 });

      job.start();
      job.start(); // second call should be a no-op
      await vi.advanceTimersByTimeAsync(1500);
      expect(repo.listTrees).toHaveBeenCalledTimes(1);

      job.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls onError when a tick fails', async () => {
    vi.useFakeTimers();
    try {
      const error = new Error('provider down');
      const failingProvider = mockProvider({
        embed: vi.fn(async () => {
          throw error;
        }),
      });
      const tree = makeTree();
      const node = makeNode();
      repo = mockRepository([tree], { 'tree-1': [node] });
      const onError = vi.fn();

      const job = createEmbeddingJob({
        repository: repo,
        provider: failingProvider,
        intervalMs: 100,
        onError,
      });

      job.start();
      vi.advanceTimersByTime(150);
      // Allow the microtask (promise rejection) to settle
      await vi.advanceTimersByTimeAsync(0);
      expect(onError).toHaveBeenCalledWith(error);

      job.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
