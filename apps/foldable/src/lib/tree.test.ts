import { describe, it, expect } from 'vitest';
import type { Node } from '@lineage/core';
import {
  buildChildrenMap,
  buildNodeMap,
  childrenOf,
  deepestNewestLeaf,
  pathToRoot,
  pathToSummaryOrRoot,
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

  it('pathToSummaryOrRoot stops at the lowest summary ancestor (inclusive)', () => {
    // root → a → s(summary) → d → e
    const withSummary: Node[] = [
      n('root', null, '2026-01-01T00:00:00Z'),
      n('a', 'root', '2026-01-01T00:01:00Z'),
      { ...n('s', 'a', '2026-01-01T00:02:00Z'), type: 'summary' },
      n('d', 's', '2026-01-01T00:03:00Z'),
      n('e', 'd', '2026-01-01T00:04:00Z'),
    ];
    const map = buildNodeMap(withSummary);
    // From e, stop at s (the lowest summary) — not all the way to root.
    expect(pathToSummaryOrRoot(map, 'e').map((x) => x.nodeId)).toEqual(['s', 'd', 'e']);
    // With no summary above, falls back to the root.
    expect(pathToSummaryOrRoot(buildNodeMap(nodes), 'b').map((x) => x.nodeId)).toEqual(['root', 'a', 'b']);
    // Starting on a summary returns just that summary.
    expect(pathToSummaryOrRoot(map, 's').map((x) => x.nodeId)).toEqual(['s']);
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

});
