import { describe, it, expect } from 'vitest';
import {
  buildChildrenMap,
  findDeepestFirstChild,
  buildPathEntries,
} from '../components/graph/linearUtils.js';
import type { GraphNode } from '../components/graph/GraphRendererTypes.js';

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: 'human',
    content: `Node ${overrides.id}`,
    parentId: null,
    depth: 0,
    isDeleted: false,
    childCount: 0,
    metadata: {
      modelName: null,
      provider: null,
      tokenCount: null,
      createdAt: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

// Tree structure:
//   root
//   ├── a
//   │   ├── c (leaf)
//   │   └── d (leaf)
//   └── b
//       └── e (leaf)
const TREE: GraphNode[] = [
  makeNode({ id: 'root', depth: 0, childCount: 2 }),
  makeNode({ id: 'a', parentId: 'root', depth: 1, childCount: 2, type: 'ai' }),
  makeNode({ id: 'b', parentId: 'root', depth: 1, childCount: 1 }),
  makeNode({ id: 'c', parentId: 'a', depth: 2 }),
  makeNode({ id: 'd', parentId: 'a', depth: 2, type: 'summary' }),
  makeNode({ id: 'e', parentId: 'b', depth: 2, type: 'ai' }),
];

const NODE_BY_ID = new Map(TREE.map((n) => [n.id, n]));

describe('buildChildrenMap', () => {
  const map = buildChildrenMap(TREE);

  it('groups children by parentId', () => {
    expect(map.get('root')?.map((n) => n.id)).toEqual(['a', 'b']);
    expect(map.get('a')?.map((n) => n.id)).toEqual(['c', 'd']);
    expect(map.get('b')?.map((n) => n.id)).toEqual(['e']);
  });

  it('roots are keyed under null', () => {
    expect(map.get(null)?.map((n) => n.id)).toEqual(['root']);
  });

  it('leaf nodes have no entry', () => {
    expect(map.get('c')).toBeUndefined();
    expect(map.get('d')).toBeUndefined();
    expect(map.get('e')).toBeUndefined();
  });

  it('returns empty map for empty input', () => {
    expect(buildChildrenMap([])).toEqual(new Map());
  });
});

describe('findDeepestFirstChild', () => {
  const childrenOf = buildChildrenMap(TREE);

  it('follows first child at each level to the leaf', () => {
    expect(findDeepestFirstChild('root', NODE_BY_ID, childrenOf)).toBe('c');
  });

  it('returns the node itself when it is a leaf', () => {
    expect(findDeepestFirstChild('c', NODE_BY_ID, childrenOf)).toBe('c');
    expect(findDeepestFirstChild('e', NODE_BY_ID, childrenOf)).toBe('e');
  });

  it('follows first child from a mid-level node', () => {
    expect(findDeepestFirstChild('b', NODE_BY_ID, childrenOf)).toBe('e');
  });

  it('returns the startId for an unknown node', () => {
    expect(findDeepestFirstChild('nonexistent', NODE_BY_ID, childrenOf)).toBe('nonexistent');
  });
});

describe('buildPathEntries', () => {
  const childrenOf = buildChildrenMap(TREE);

  it('returns path from root to selected node with siblings at each level', () => {
    const entries = buildPathEntries('c', TREE, NODE_BY_ID, childrenOf);

    expect(entries.map((e) => e.node.id)).toEqual(['root', 'a', 'c']);
  });

  it('includes correct siblings at each level', () => {
    const entries = buildPathEntries('c', TREE, NODE_BY_ID, childrenOf);

    // root is the only child of null
    expect(entries[0].siblings.map((s) => s.id)).toEqual(['root']);
    // a and b are siblings under root
    expect(entries[1].siblings.map((s) => s.id)).toEqual(['a', 'b']);
    // c and d are siblings under a
    expect(entries[2].siblings.map((s) => s.id)).toEqual(['c', 'd']);
  });

  it('works for a different branch', () => {
    const entries = buildPathEntries('e', TREE, NODE_BY_ID, childrenOf);

    expect(entries.map((e) => e.node.id)).toEqual(['root', 'b', 'e']);
    // b's siblings are a and b
    expect(entries[1].siblings.map((s) => s.id)).toEqual(['a', 'b']);
    // e is the only child of b
    expect(entries[2].siblings.map((s) => s.id)).toEqual(['e']);
  });

  it('returns single entry for root selection', () => {
    const entries = buildPathEntries('root', TREE, NODE_BY_ID, childrenOf);
    expect(entries).toHaveLength(1);
    expect(entries[0].node.id).toBe('root');
  });
});
