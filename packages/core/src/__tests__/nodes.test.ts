import { describe, it, expect } from 'vitest';
import { createNode, parentIdsOf, MERGE_PARENT_IDS_KEY } from '../nodes.js';
import type { Node } from '../types.js';

function makeNode(overrides: Partial<Node> & Pick<Node, 'nodeId'>): Node {
  return {
    treeId: 'tree-1',
    parentId: null,
    type: 'human',
    content: '',
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

describe('parentIdsOf', () => {
  it('returns an empty array for a parentless node with no merge parents', () => {
    expect(parentIdsOf(makeNode({ nodeId: 'root' }))).toEqual([]);
  });

  it('returns just the primary parent when there are no merge parents', () => {
    expect(parentIdsOf(makeNode({ nodeId: 'n', parentId: 'p' }))).toEqual(['p']);
  });

  it('returns the primary parent first, then merge parents in stored order', () => {
    const node = makeNode({
      nodeId: 'merge',
      parentId: 'sA',
      metadata: { [MERGE_PARENT_IDS_KEY]: ['sA', 'sB', 'sC'] },
    });
    expect(parentIdsOf(node)).toEqual(['sA', 'sB', 'sC']);
  });

  it('dedupes the primary parent when it is repeated in mergeParentIds', () => {
    const node = makeNode({
      nodeId: 'merge',
      parentId: 'sA',
      metadata: { [MERGE_PARENT_IDS_KEY]: ['sB', 'sA', 'sB'] },
    });
    expect(parentIdsOf(node)).toEqual(['sA', 'sB']);
  });

  it('handles merge parents with no primary parentId', () => {
    const node = makeNode({
      nodeId: 'merge',
      parentId: null,
      metadata: { [MERGE_PARENT_IDS_KEY]: ['sA', 'sB'] },
    });
    expect(parentIdsOf(node)).toEqual(['sA', 'sB']);
  });

  it('ignores non-array / non-string metadata values', () => {
    expect(
      parentIdsOf(makeNode({ nodeId: 'n', parentId: 'p', metadata: { mergeParentIds: 'nope' } })),
    ).toEqual(['p']);
    expect(
      parentIdsOf(
        makeNode({ nodeId: 'n', parentId: 'p', metadata: { mergeParentIds: ['ok', 42, '', null] } }),
      ),
    ).toEqual(['p', 'ok']);
  });

  it('createNode round-trips mergeParentIds through metadata', () => {
    const node = createNode({
      treeId: 'tree-1',
      parentId: 'sA',
      type: 'human',
      content: '',
      metadata: { [MERGE_PARENT_IDS_KEY]: ['sA', 'sB'] },
    });
    expect(parentIdsOf(node)).toEqual(['sA', 'sB']);
  });
});
