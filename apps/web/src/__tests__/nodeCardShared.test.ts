import { describe, it, expect } from 'vitest';
import { nodeLabel } from '../components/graph/NodeCardShared.js';
import type { GraphNode } from '../components/graph/GraphRendererTypes.js';

function makeNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'test',
    type: 'human',
    content: 'test',
    parentId: null,
    depth: 0,
    isDeleted: false,
    childCount: 0,
    metadata: { modelName: null, provider: null, tokenCount: null, createdAt: '2026-01-01T00:00:00Z' },
    ...overrides,
  };
}

describe('nodeLabel', () => {
  it('returns DELETED for deleted nodes', () => {
    expect(nodeLabel(makeNode({ isDeleted: true, type: 'human' }))).toBe('DELETED');
    expect(nodeLabel(makeNode({ isDeleted: true, type: 'ai' }))).toBe('DELETED');
  });

  it('returns uppercased type for non-deleted nodes', () => {
    expect(nodeLabel(makeNode({ type: 'human' }))).toBe('HUMAN');
    expect(nodeLabel(makeNode({ type: 'ai' }))).toBe('AI');
    expect(nodeLabel(makeNode({ type: 'summary' }))).toBe('SUMMARY');
  });
});
