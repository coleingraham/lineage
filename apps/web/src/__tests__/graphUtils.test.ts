import { describe, it, expect } from 'vitest';
import { getAncestorIds, buildFlatList, findRoot } from '../components/graph/graphUtils.js';
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

const TREE: GraphNode[] = [
  makeNode({ id: 'root', depth: 0, childCount: 2 }),
  makeNode({ id: 'a', parentId: 'root', depth: 1, childCount: 1 }),
  makeNode({ id: 'b', parentId: 'root', depth: 1, type: 'ai' }),
  makeNode({ id: 'c', parentId: 'a', depth: 2, type: 'summary' }),
];

describe('getAncestorIds', () => {
  it('returns the full path from root to the target node', () => {
    expect(getAncestorIds(TREE, 'c')).toEqual(['root', 'a', 'c']);
  });

  it('returns just the root for the root node', () => {
    expect(getAncestorIds(TREE, 'root')).toEqual(['root']);
  });

  it('returns a single-element path for a direct child of root', () => {
    expect(getAncestorIds(TREE, 'b')).toEqual(['root', 'b']);
  });

  it('returns an empty array for an unknown node', () => {
    expect(getAncestorIds(TREE, 'nonexistent')).toEqual([]);
  });
});

describe('buildFlatList', () => {
  it('attaches _children to each node', () => {
    const flat = buildFlatList(TREE);
    const root = flat.find((n) => n.id === 'root')!;
    expect(root._children.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('leaf nodes get empty _children', () => {
    const flat = buildFlatList(TREE);
    const c = flat.find((n) => n.id === 'c')!;
    expect(c._children).toEqual([]);
  });

  it('preserves the original node count', () => {
    const flat = buildFlatList(TREE);
    expect(flat).toHaveLength(TREE.length);
  });
});

describe('findRoot', () => {
  it('finds the node with null parentId', () => {
    expect(findRoot(TREE)?.id).toBe('root');
  });

  it('returns undefined for an empty array', () => {
    expect(findRoot([])).toBeUndefined();
  });

  it('returns the first root if multiple exist', () => {
    const nodes = [makeNode({ id: 'r1' }), makeNode({ id: 'r2' })];
    expect(findRoot(nodes)?.id).toBe('r1');
  });
});
