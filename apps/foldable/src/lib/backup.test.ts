import { describe, it, expect } from 'vitest';
import type { CrossTreeRef, Node, NodeRepository, Tree } from '@lineage/core';
import { buildBackup } from './backup.js';

function tree(treeId: string): Tree {
  return { treeId, title: treeId, createdAt: '2026-01-01T00:00:00Z', rootNodeId: `${treeId}-root`, contextSources: null };
}

function node(nodeId: string, treeId: string, parentId: string | null): Node {
  return {
    nodeId,
    treeId,
    parentId,
    type: 'human',
    content: nodeId,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    metadata: null,
    author: null,
    intent: parentId === null ? null : 'sequence',
  };
}

// Minimal repo exposing only what buildBackup reads — proves it is repo-agnostic.
function fakeRepo(
  trees: Tree[],
  nodesByTree: Record<string, Node[]>,
  refsByTree: Record<string, CrossTreeRef[]>,
): NodeRepository {
  return {
    listTrees: async () => trees,
    getNodes: async (treeId: string) => nodesByTree[treeId] ?? [],
    getCrossTreeRefs: async (query?: { fromTreeId?: string }) => refsByTree[query?.fromTreeId ?? ''] ?? [],
  } as unknown as NodeRepository;
}

describe('buildBackup', () => {
  it('assembles trees with their nodes and owned cross-tree refs', async () => {
    const ref: CrossTreeRef = {
      fromTreeId: 'a',
      fromNodeId: 'a-root',
      toTreeId: 'b',
      toNodeId: 'b-root',
      kind: 'fork_provenance',
      live: true,
    };
    const repo = fakeRepo(
      [tree('a'), tree('b')],
      { a: [node('a-root', 'a', null), node('a1', 'a', 'a-root')], b: [node('b-root', 'b', null)] },
      { a: [ref], b: [] },
    );

    const doc = await buildBackup(repo, '2026-05-31T00:00:00Z');

    expect(doc.format).toBe('lineage-foldable-backup');
    expect(doc.version).toBe(1);
    expect(doc.exportedAt).toBe('2026-05-31T00:00:00Z');
    expect(doc.trees.map((t) => t.tree.treeId)).toEqual(['a', 'b']);
    expect(doc.trees[0].nodes.map((n) => n.nodeId)).toEqual(['a-root', 'a1']);
    expect(doc.trees[0].crossTreeRefs).toEqual([ref]);
    expect(doc.trees[1].nodes.map((n) => n.nodeId)).toEqual(['b-root']);
    expect(doc.trees[1].crossTreeRefs).toEqual([]);
  });
});
