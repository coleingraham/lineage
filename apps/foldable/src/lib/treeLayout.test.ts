import { describe, it, expect } from 'vitest';
import type { Node } from '@lineage/core';
import { layoutTree } from './treeLayout.js';

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

describe('layoutTree', () => {
  it('places leaves in successive columns and centres parents over children', () => {
    // root → a → b ; root → c
    const nodes = [
      n('root', null, '2026-01-01T00:00:00Z'),
      n('a', 'root', '2026-01-01T00:01:00Z'),
      n('b', 'a', '2026-01-01T00:02:00Z'),
      n('c', 'root', '2026-01-01T00:03:00Z'),
    ];
    const { pos, maxCol, maxDepth } = layoutTree(nodes);
    // Leaves: b (col 0), c (col 1). a centred over b → 0. root centred over a,c → 0.5.
    expect(pos.get('b')).toEqual({ col: 0, depth: 2 });
    expect(pos.get('c')).toEqual({ col: 1, depth: 1 });
    expect(pos.get('a')).toEqual({ col: 0, depth: 1 });
    expect(pos.get('root')).toEqual({ col: 0.5, depth: 0 });
    expect(maxCol).toBe(1);
    expect(maxDepth).toBe(2);
  });

  it('returns an empty layout when there is no root', () => {
    expect(layoutTree([]).pos.size).toBe(0);
  });
});
