import { describe, it, expect } from 'vitest';
import type { Node } from '@lineage/core';
import {
  buildChildrenMap,
  buildColumns,
  buildNodeMap,
  childrenOf,
  deepestNewestLeaf,
  pathToRoot,
} from './tree.js';

function n(id: string, parentId: string | null, createdAt: string): Node {
  return {
    nodeId: id,
    treeId: 't',
    parentId,
    type: 'human',
    content: id,
    isDeleted: false,
    createdAt,
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    metadata: null,
    author: null,
    intent: parentId === null ? null : 'sequence',
  };
}

// root → a → b ; root → c (a divergence)
const nodes: Node[] = [
  n('root', null, '2026-01-01T00:00:00Z'),
  n('a', 'root', '2026-01-01T00:01:00Z'),
  n('b', 'a', '2026-01-01T00:02:00Z'),
  n('c', 'root', '2026-01-01T00:03:00Z'),
];

describe('tree helpers', () => {
  it('pathToRoot returns the active line root-first', () => {
    const map = buildNodeMap(nodes);
    expect(pathToRoot(map, 'b').map((x) => x.nodeId)).toEqual(['root', 'a', 'b']);
    expect(pathToRoot(map, 'c').map((x) => x.nodeId)).toEqual(['root', 'c']);
  });

  it('childrenOf returns children oldest-first', () => {
    const cmap = buildChildrenMap(nodes);
    expect(childrenOf(cmap, 'root').map((x) => x.nodeId)).toEqual(['a', 'c']);
  });

  it('deepestNewestLeaf follows the newest child to a leaf', () => {
    const map = buildNodeMap(nodes);
    const cmap = buildChildrenMap(nodes);
    // newest child of root is c (00:03) — a leaf.
    expect(deepestNewestLeaf('root', map, cmap)).toBe('c');
    // from a, the only line ends at b.
    expect(deepestNewestLeaf('a', map, cmap)).toBe('b');
  });

  it('buildColumns produces Miller columns along the active path', () => {
    const map = buildNodeMap(nodes);
    const cmap = buildChildrenMap(nodes);
    const path = pathToRoot(map, 'b'); // root → a → b
    const cols = buildColumns(cmap, path);
    expect(cols.map((c) => c.items.map((n) => n.nodeId))).toEqual([['root'], ['a', 'c'], ['b']]);
    expect(cols.map((c) => c.selectedId)).toEqual(['root', 'a', 'b']);
    // The focused leaf 'b' has no children, so there is no trailing column.
    expect(cols).toHaveLength(3);
  });
});
