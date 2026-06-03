import { describe, it, expect, vi } from 'vitest';
import { buildContext, assembleContext } from '../context.js';
import type { Node } from '../types.js';
import type { NodeRepository } from '../repository.js';

function makeNode(overrides: Partial<Node> & Pick<Node, 'nodeId'>): Node {
  return {
    treeId: 'tree-1',
    parentId: null,
    type: 'human',
    content: 'hello',
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    metadata: null,
    author: null,
    intent: null,
    ...overrides,
  };
}

describe('buildContext', () => {
  it('returns messages from root to target in order', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: 'hi', type: 'human' }),
      makeNode({ nodeId: 'a1', parentId: 'root', content: 'hello', type: 'ai' }),
      makeNode({ nodeId: 'h2', parentId: 'a1', content: 'thanks', type: 'human' }),
    ];

    const result = buildContext(nodes, 'h2');
    expect(result).toEqual([
      { role: 'human', content: 'hi' },
      { role: 'ai', content: 'hello' },
      { role: 'human', content: 'thanks' },
    ]);
  });

  it('excludes the empty root node', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: '', type: 'human' }),
      makeNode({ nodeId: 'h1', parentId: 'root', content: 'hi', type: 'human' }),
    ];

    const result = buildContext(nodes, 'h1');
    expect(result).toEqual([{ role: 'human', content: 'hi' }]);
  });

  it('maps summary nodes to ai role and treats them as context boundaries', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: 'start', type: 'human' }),
      makeNode({ nodeId: 's1', parentId: 'root', content: 'summary text', type: 'summary' }),
      makeNode({ nodeId: 'h2', parentId: 's1', content: 'follow-up', type: 'human' }),
    ];

    // When targeting the summary itself, only the summary is context
    expect(buildContext(nodes, 's1')).toEqual([{ role: 'ai', content: 'summary text' }]);

    // When targeting a child of the summary, context starts at the summary
    expect(buildContext(nodes, 'h2')).toEqual([
      { role: 'ai', content: 'summary text' },
      { role: 'human', content: 'follow-up' },
    ]);
  });

  it('stops at deleted nodes', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: 'hi', type: 'human' }),
      makeNode({ nodeId: 'a1', parentId: 'root', content: 'resp', type: 'ai', isDeleted: true }),
      makeNode({ nodeId: 'h2', parentId: 'a1', content: 'follow-up', type: 'human' }),
    ];

    const result = buildContext(nodes, 'h2');
    // only the segment below the deleted node
    expect(result).toEqual([{ role: 'human', content: 'follow-up' }]);
  });

  it('returns empty array for unknown target node', () => {
    const nodes: Node[] = [makeNode({ nodeId: 'root', content: 'hi' })];
    expect(buildContext(nodes, 'nonexistent')).toEqual([]);
  });

  it('follows the correct branch in a tree with multiple children', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: '', type: 'human' }),
      makeNode({ nodeId: 'h1', parentId: 'root', content: 'branch A', type: 'human' }),
      makeNode({ nodeId: 'h2', parentId: 'root', content: 'branch B', type: 'human' }),
      makeNode({ nodeId: 'a1', parentId: 'h1', content: 'response A', type: 'ai' }),
    ];

    const result = buildContext(nodes, 'a1');
    expect(result).toEqual([
      { role: 'human', content: 'branch A' },
      { role: 'ai', content: 'response A' },
    ]);
  });

  describe('token budgeting', () => {
    it('drops oldest messages when over budget', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'root', content: 'old', type: 'human', tokenCount: 100 }),
        makeNode({ nodeId: 'a1', parentId: 'root', content: 'mid', type: 'ai', tokenCount: 100 }),
        makeNode({
          nodeId: 'h2',
          parentId: 'a1',
          content: 'new',
          type: 'human',
          tokenCount: 100,
        }),
      ];

      const result = buildContext(nodes, 'h2', { maxContextTokens: 200 });
      expect(result).toEqual([
        { role: 'ai', content: 'mid' },
        { role: 'human', content: 'new' },
      ]);
    });

    it('keeps all messages when within budget', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'root', content: 'a', type: 'human', tokenCount: 10 }),
        makeNode({ nodeId: 'a1', parentId: 'root', content: 'b', type: 'ai', tokenCount: 10 }),
      ];

      const result = buildContext(nodes, 'a1', { maxContextTokens: 100 });
      expect(result).toHaveLength(2);
    });

    it('always keeps at least the last message', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'root', content: 'a', type: 'human', tokenCount: 500 }),
        makeNode({ nodeId: 'h1', parentId: 'root', content: 'b', type: 'human', tokenCount: 500 }),
      ];

      const result = buildContext(nodes, 'h1', { maxContextTokens: 10 });
      expect(result).toEqual([{ role: 'human', content: 'b' }]);
    });
  });

  describe('multi-parent merge nodes', () => {
    // A merge node points at several summary parents via metadata.mergeParentIds.
    // Each summary is a boundary, so context = each summary (in order) + the node.
    function mergeMeta(ids: string[]) {
      return { metadata: { mergeParentIds: ids } };
    }

    it('includes every summary parent, in mergeParentIds order, then the node', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'rootA', content: 'A thread', type: 'human' }),
        makeNode({ nodeId: 'sA', parentId: 'rootA', content: 'summary A', type: 'summary' }),
        makeNode({ nodeId: 'rootB', content: 'B thread', type: 'human' }),
        makeNode({ nodeId: 'sB', parentId: 'rootB', content: 'summary B', type: 'summary' }),
        makeNode({
          nodeId: 'merge',
          parentId: 'sA',
          content: 'merged input',
          type: 'human',
          ...mergeMeta(['sA', 'sB']),
        }),
      ];

      expect(buildContext(nodes, 'merge')).toEqual([
        { role: 'ai', content: 'summary A' },
        { role: 'ai', content: 'summary B' },
        { role: 'human', content: 'merged input' },
      ]);
    });

    it('does not traverse above the summary parents (boundary holds)', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'h0', content: 'should NOT appear', type: 'human' }),
        makeNode({ nodeId: 'sA', parentId: 'h0', content: 'summary A', type: 'summary' }),
        makeNode({ nodeId: 'sB', content: 'summary B', type: 'summary' }),
        makeNode({
          nodeId: 'merge',
          parentId: 'sA',
          content: 'merged',
          type: 'human',
          ...mergeMeta(['sA', 'sB']),
        }),
      ];

      const result = buildContext(nodes, 'merge');
      expect(result).toEqual([
        { role: 'ai', content: 'summary A' },
        { role: 'ai', content: 'summary B' },
        { role: 'human', content: 'merged' },
      ]);
    });

    it('includes the merge node when continuing below it', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'sA', content: 'summary A', type: 'summary' }),
        makeNode({ nodeId: 'sB', content: 'summary B', type: 'summary' }),
        makeNode({
          nodeId: 'merge',
          parentId: 'sA',
          content: 'merged input',
          type: 'human',
          ...mergeMeta(['sA', 'sB']),
        }),
        makeNode({ nodeId: 'reply', parentId: 'merge', content: 'response', type: 'ai' }),
      ];

      expect(buildContext(nodes, 'reply')).toEqual([
        { role: 'ai', content: 'summary A' },
        { role: 'ai', content: 'summary B' },
        { role: 'human', content: 'merged input' },
        { role: 'ai', content: 'response' },
      ]);
    });

    it('dedupes a shared ancestor reached through two parents (diamond)', () => {
      // Both non-summary parents share the same ancestor `root`; it appears once.
      const nodes: Node[] = [
        makeNode({ nodeId: 'root', content: 'shared', type: 'human' }),
        makeNode({ nodeId: 'left', parentId: 'root', content: 'left', type: 'human' }),
        makeNode({ nodeId: 'right', parentId: 'root', content: 'right', type: 'human' }),
        makeNode({
          nodeId: 'merge',
          parentId: 'left',
          content: 'merged',
          type: 'human',
          ...mergeMeta(['left', 'right']),
        }),
      ];

      expect(buildContext(nodes, 'merge')).toEqual([
        { role: 'human', content: 'shared' },
        { role: 'human', content: 'left' },
        { role: 'human', content: 'right' },
        { role: 'human', content: 'merged' },
      ]);
    });
  });
});

describe('assembleContext', () => {
  function makeMockRepo(nodes: Node[]): NodeRepository {
    const nodesById = new Map(nodes.map((n) => [n.nodeId, n]));
    return {
      getNode: vi.fn(async (nodeId: string) => {
        const node = nodesById.get(nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found`);
        return node;
      }),
      getTree: vi.fn(),
      listTrees: vi.fn(),
      putTree: vi.fn(),
      getNodes: vi.fn(),
      putNode: vi.fn(),
      softDeleteNode: vi.fn(),
      deleteTree: vi.fn(),
      updateNodeEmbedding: vi.fn(),
    };
  }

  it('returns empty string for empty sources', async () => {
    const repo = makeMockRepo([]);
    expect(await assembleContext(repo, [])).toBe('');
  });

  it('assembles summaries in source order with header', async () => {
    const repo = makeMockRepo([
      makeNode({ nodeId: 'n1', content: 'Summary one.', type: 'summary' }),
      makeNode({ nodeId: 'n2', content: 'Summary two.', type: 'summary' }),
    ]);

    const result = await assembleContext(repo, [
      { treeId: 'tree-1', nodeId: 'n1' },
      { treeId: 'tree-1', nodeId: 'n2' },
    ]);

    expect(result).toContain('[1] Summary one.');
    expect(result).toContain('[2] Summary two.');
    expect(result).toContain('background context');
  });

  it('skips missing nodes gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = makeMockRepo([
      makeNode({ nodeId: 'n1', content: 'Summary one.', type: 'summary' }),
    ]);

    const result = await assembleContext(repo, [
      { treeId: 'tree-1', nodeId: 'missing' },
      { treeId: 'tree-1', nodeId: 'n1' },
    ]);

    expect(result).toContain('[1] Summary one.');
    expect(result).not.toContain('[2]');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing'));
    warnSpy.mockRestore();
  });

  it('skips deleted nodes gracefully', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = makeMockRepo([
      makeNode({ nodeId: 'n1', content: 'deleted summary', type: 'summary', isDeleted: true }),
      makeNode({ nodeId: 'n2', content: 'Good summary.', type: 'summary' }),
    ]);

    const result = await assembleContext(repo, [
      { treeId: 'tree-1', nodeId: 'n1' },
      { treeId: 'tree-1', nodeId: 'n2' },
    ]);

    expect(result).toContain('[1] Good summary.');
    expect(result).not.toContain('deleted summary');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deleted'));
    warnSpy.mockRestore();
  });

  it('returns empty string when all nodes are missing or deleted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = makeMockRepo([
      makeNode({ nodeId: 'n1', content: 'x', type: 'summary', isDeleted: true }),
    ]);

    const result = await assembleContext(repo, [
      { treeId: 'tree-1', nodeId: 'n1' },
      { treeId: 'tree-1', nodeId: 'gone' },
    ]);

    expect(result).toBe('');
    vi.restoreAllMocks();
  });

  it('strips thinking blocks from content', async () => {
    const repo = makeMockRepo([
      makeNode({
        nodeId: 'n1',
        content:
          '<details>\n<summary>Thinking</summary>\n\nthinking...\n\n</details>\n\nActual summary.',
        type: 'summary',
      }),
    ]);

    const result = await assembleContext(repo, [{ treeId: 'tree-1', nodeId: 'n1' }]);

    expect(result).toContain('Actual summary.');
    expect(result).not.toContain('thinking...');
  });
});
