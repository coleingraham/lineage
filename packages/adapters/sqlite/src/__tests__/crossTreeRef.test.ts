import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  buildContext,
  assembleContext,
  CROSS_TREE_REF_KINDS,
  type CrossTreeRef,
  type Node,
  type NodeRepository,
  type Tree,
} from '@lineage/core';
import { InMemoryRepository } from '../memory.js';
import { SqliteRepository } from '../server.js';

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    treeId: 'tree-a',
    title: 'A',
    createdAt: '2026-01-01T00:00:00.000Z',
    rootNodeId: 'a-root',
    contextSources: null,
    ...overrides,
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    nodeId: 'n1',
    treeId: 'tree-a',
    parentId: null,
    type: 'human',
    content: '',
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    metadata: null,
    author: null,
    ...overrides,
  };
}

const fixtures: { name: string; create: () => NodeRepository }[] = [
  { name: 'InMemoryRepository', create: () => new InMemoryRepository() },
  { name: 'SqliteRepository', create: () => new SqliteRepository(new Database(':memory:')) },
];

describe.each(fixtures)('CrossTreeRef — $name', ({ create }) => {
  let repo: NodeRepository;

  beforeEach(() => {
    repo = create();
  });

  const forkRef: CrossTreeRef = {
    fromTreeId: 'tree-b',
    fromNodeId: 'b-copy',
    toTreeId: 'tree-a',
    toNodeId: 'a-orig',
    kind: CROSS_TREE_REF_KINDS.FORK_PROVENANCE,
    live: true,
  };

  it('round-trips a node-owned ref', async () => {
    await repo.putCrossTreeRef(forkRef);
    const all = await repo.getCrossTreeRefs();
    expect(all).toContainEqual(forkRef);
  });

  it('filters by query fields', async () => {
    await repo.putCrossTreeRef(forkRef);
    await repo.putCrossTreeRef({ ...forkRef, fromNodeId: 'b-copy-2', toNodeId: 'a-orig-2' });

    expect(await repo.getCrossTreeRefs({ toNodeId: 'a-orig-2' })).toHaveLength(1);
    expect(
      await repo.getCrossTreeRefs({ kind: CROSS_TREE_REF_KINDS.FORK_PROVENANCE }),
    ).toHaveLength(2);
    expect(await repo.getCrossTreeRefs({ kind: CROSS_TREE_REF_KINDS.SYNTHESIS_LINK })).toHaveLength(
      0,
    );
  });

  it('matches a null fromNodeId distinctly from a set one', async () => {
    await repo.putCrossTreeRef(forkRef);
    await repo.putCrossTreeRef({
      ...forkRef,
      fromNodeId: null,
      kind: CROSS_TREE_REF_KINDS.CONTEXT_SOURCE,
    });
    const treeOwned = await repo.getCrossTreeRefs({ fromNodeId: null });
    expect(treeOwned).toHaveLength(1);
    expect(treeOwned[0].fromNodeId).toBeNull();
    expect(treeOwned[0].kind).toBe(CROSS_TREE_REF_KINDS.CONTEXT_SOURCE);
  });

  it('upserts on the full key (no duplicates)', async () => {
    await repo.putCrossTreeRef(forkRef);
    await repo.putCrossTreeRef({ ...forkRef, live: false });
    const all = await repo.getCrossTreeRefs({ toNodeId: 'a-orig' });
    expect(all).toHaveLength(1);
    expect(all[0].live).toBe(false);
  });

  it('deletes by query and reports the count', async () => {
    await repo.putCrossTreeRef(forkRef);
    await repo.putCrossTreeRef({ ...forkRef, fromNodeId: 'b-copy-2', toNodeId: 'a-orig-2' });
    const removed = await repo.deleteCrossTreeRefs({ fromTreeId: 'tree-b' });
    expect(removed).toBe(2);
    expect(await repo.getCrossTreeRefs()).toHaveLength(0);
  });

  it('re-expresses context_sources as tree-owned refs (round-trip unchanged)', async () => {
    await repo.putTree(makeTree({ contextSources: [{ treeId: 'tree-x', nodeId: 'x1' }] }));
    // Behavior unchanged: getTree returns the same contextSources.
    const tree = await repo.getTree('tree-a');
    expect(tree.contextSources).toEqual([{ treeId: 'tree-x', nodeId: 'x1' }]);
    // Stored as a tree-owned context_source ref in the unified table.
    const refs = await repo.getCrossTreeRefs({
      fromTreeId: 'tree-a',
      kind: CROSS_TREE_REF_KINDS.CONTEXT_SOURCE,
    });
    expect(refs).toEqual([
      {
        fromTreeId: 'tree-a',
        fromNodeId: null,
        toTreeId: 'tree-x',
        toNodeId: 'x1',
        kind: CROSS_TREE_REF_KINDS.CONTEXT_SOURCE,
        live: true,
      },
    ]);
  });

  it('replaces context_sources on re-put', async () => {
    await repo.putTree(makeTree({ contextSources: [{ treeId: 'tree-x', nodeId: 'x1' }] }));
    await repo.putTree(makeTree({ contextSources: [{ treeId: 'tree-y', nodeId: 'y1' }] }));
    const tree = await repo.getTree('tree-a');
    expect(tree.contextSources).toEqual([{ treeId: 'tree-y', nodeId: 'y1' }]);
  });

  // The hard guarantee from THO-63: a CrossTreeRef is off-spine and must never
  // be followed when assembling a node's context.
  it('is excluded from context assembly (never traversed)', async () => {
    // Tree A: a real conversation the ref points into.
    await repo.putTree(makeTree({ treeId: 'tree-a', rootNodeId: 'a-root' }));
    await repo.putNode(makeNode({ nodeId: 'a-root', treeId: 'tree-a', content: 'SECRET-FROM-A' }));

    // Tree B: a two-node chain, with a fork_provenance ref into A.
    await repo.putTree(makeTree({ treeId: 'tree-b', rootNodeId: 'b-root' }));
    await repo.putNode(
      makeNode({ nodeId: 'b-root', treeId: 'tree-b', parentId: null, content: 'b hello' }),
    );
    await repo.putNode(
      makeNode({ nodeId: 'b-leaf', treeId: 'tree-b', parentId: 'b-root', content: 'b reply' }),
    );
    await repo.putCrossTreeRef({
      fromTreeId: 'tree-b',
      fromNodeId: 'b-leaf',
      toTreeId: 'tree-a',
      toNodeId: 'a-root',
      kind: CROSS_TREE_REF_KINDS.FORK_PROVENANCE,
      live: true,
    });

    // Building B's context walks parent edges only — A is never pulled in.
    const bNodes = await repo.getNodes('tree-b');
    const messages = buildContext(bNodes, 'b-leaf');
    const joined = messages.map((m) => m.content).join('\n');
    expect(joined).toContain('b hello');
    expect(joined).toContain('b reply');
    expect(joined).not.toContain('SECRET-FROM-A');

    // A fork_provenance ref does not leak into B's contextSources.
    const treeB = await repo.getTree('tree-b');
    expect(treeB.contextSources).toBeNull();

    // assembleContext only consumes an explicit context-source list.
    const block = await assembleContext(repo, treeB.contextSources ?? []);
    expect(block).toBe('');

    // The ref is still stored — excluded from traversal, not dropped.
    expect(
      await repo.getCrossTreeRefs({ kind: CROSS_TREE_REF_KINDS.FORK_PROVENANCE }),
    ).toHaveLength(1);
  });
});
