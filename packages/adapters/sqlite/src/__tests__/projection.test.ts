import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  project,
  forkTransform,
  buildContext,
  CROSS_TREE_REF_KINDS,
  type Node,
  type NodeRepository,
  type Tree,
} from '@lineage/core';
import { InMemoryRepository } from '../memory.js';
import { SqliteRepository } from '../server.js';

function makeTree(treeId: string, rootNodeId: string): Tree {
  return {
    treeId,
    title: treeId,
    createdAt: '2026-01-01T00:00:00.000Z',
    rootNodeId,
    contextSources: null,
  };
}

function makeNode(overrides: Partial<Node> & Pick<Node, 'nodeId' | 'treeId'>): Node {
  return {
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
    intent: null,
    ...overrides,
  };
}

const fixtures: { name: string; create: () => NodeRepository }[] = [
  { name: 'InMemoryRepository', create: () => new InMemoryRepository() },
  { name: 'SqliteRepository', create: () => new SqliteRepository(new Database(':memory:')) },
];

describe.each(fixtures)('forkTransform via project() — $name', ({ create }) => {
  let repo: NodeRepository;
  let counter: number;
  const newId = () => `copy-${counter++}`;
  const now = () => '2026-02-02T00:00:00.000Z';

  beforeEach(async () => {
    repo = create();
    counter = 0;

    // Source tree A: root -> a1 -> {a2, a3}.
    await repo.putTree(makeTree('tree-a', 'a-root'));
    await repo.putNode(makeNode({ nodeId: 'a-root', treeId: 'tree-a', content: 'root' }));
    await repo.putNode(
      makeNode({ nodeId: 'a1', treeId: 'tree-a', parentId: 'a-root', content: 'a1', type: 'ai' }),
    );
    await repo.putNode(makeNode({ nodeId: 'a2', treeId: 'tree-a', parentId: 'a1', content: 'a2' }));
    await repo.putNode(makeNode({ nodeId: 'a3', treeId: 'tree-a', parentId: 'a1', content: 'a3' }));

    // Destination tree B with a single root to attach onto.
    await repo.putTree(makeTree('tree-b', 'b-root'));
    await repo.putNode(makeNode({ nodeId: 'b-root', treeId: 'tree-b', content: 'b root' }));
  });

  it('deep-copies a subtree, preserving shape, under the attachment point', async () => {
    const subtree = [await repo.getNode('a1'), await repo.getNode('a2'), await repo.getNode('a3')];
    const result = await project(
      repo,
      { nodes: subtree },
      forkTransform,
      { treeId: 'tree-b', parentNodeId: 'b-root' },
      { newId, now },
    );

    expect(result.emittedNodes).toHaveLength(3);
    for (const n of result.emittedNodes) {
      expect(n.treeId).toBe('tree-b');
      expect(n.nodeId.startsWith('copy-')).toBe(true);
    }

    // The subtree root (a1) re-parents onto the attachment point; interior
    // shape is preserved.
    const copyOfA1 = result.emittedNodes.find((n) => n.content === 'a1')!;
    expect(copyOfA1.parentId).toBe('b-root');
    const copyOfA2 = result.emittedNodes.find((n) => n.content === 'a2')!;
    const copyOfA3 = result.emittedNodes.find((n) => n.content === 'a3')!;
    expect(copyOfA2.parentId).toBe(copyOfA1.nodeId);
    expect(copyOfA3.parentId).toBe(copyOfA1.nodeId);
    expect(copyOfA1.type).toBe('ai');

    const bNodes = await repo.getNodes('tree-b');
    expect(bNodes.map((n) => n.content).sort()).toEqual(['a1', 'a2', 'a3', 'b root']);

    // The original tree A is untouched.
    expect(await repo.getNodes('tree-a')).toHaveLength(4);
  });

  it('records a live fork_provenance ref per copied node', async () => {
    const subtree = [await repo.getNode('a1'), await repo.getNode('a2')];
    const result = await project(
      repo,
      { nodes: subtree },
      forkTransform,
      { treeId: 'tree-b', parentNodeId: 'b-root' },
      { newId, now },
    );

    expect(result.refs).toHaveLength(2);
    const stored = await repo.getCrossTreeRefs({ kind: CROSS_TREE_REF_KINDS.FORK_PROVENANCE });
    expect(stored).toHaveLength(2);
    for (const ref of stored) {
      expect(ref.fromTreeId).toBe('tree-b');
      expect(ref.toTreeId).toBe('tree-a');
      expect(ref.live).toBe(true);
    }
    const copyOfA1 = result.emittedNodes.find((n) => n.content === 'a1')!;
    const refForA1 = stored.find((r) => r.fromNodeId === copyOfA1.nodeId)!;
    expect(refForA1.toNodeId).toBe('a1');
  });

  it('forked content becomes part of the destination spine (readable as context)', async () => {
    const subtree = [await repo.getNode('a1'), await repo.getNode('a2')];
    await project(
      repo,
      { nodes: subtree },
      forkTransform,
      { treeId: 'tree-b', parentNodeId: 'b-root' },
      { newId, now },
    );
    const bNodes = await repo.getNodes('tree-b');
    const leaf = bNodes.find((n) => n.content === 'a2')!;
    const messages = buildContext(bNodes, leaf.nodeId);
    const joined = messages.map((m) => m.content).join('\n');
    expect(joined).toContain('a1');
    expect(joined).toContain('a2');
  });
});
