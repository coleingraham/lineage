import { describe, it, expect } from 'vitest';
import { toGraphNodes, computeDepths } from '../components/graph/convertNodes.js';
import type { Node } from '@lineage/core';

function makeNode(overrides: Partial<Node> & { nodeId: string }): Node {
  return {
    treeId: 't1',
    parentId: null,
    type: 'human',
    content: `Node ${overrides.nodeId}`,
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    ...overrides,
  };
}

describe('computeDepths', () => {
  it('assigns depth 0 to the root node', () => {
    const nodes = [makeNode({ nodeId: 'root' })];
    const depths = computeDepths(nodes);
    expect(depths.get('root')).toBe(0);
  });

  it('computes correct depths for a linear chain', () => {
    const nodes = [
      makeNode({ nodeId: 'root' }),
      makeNode({ nodeId: 'a', parentId: 'root' }),
      makeNode({ nodeId: 'b', parentId: 'a' }),
      makeNode({ nodeId: 'c', parentId: 'b' }),
    ];
    const depths = computeDepths(nodes);
    expect(depths.get('root')).toBe(0);
    expect(depths.get('a')).toBe(1);
    expect(depths.get('b')).toBe(2);
    expect(depths.get('c')).toBe(3);
  });

  it('computes correct depths for a branching tree', () => {
    const nodes = [
      makeNode({ nodeId: 'root' }),
      makeNode({ nodeId: 'left', parentId: 'root' }),
      makeNode({ nodeId: 'right', parentId: 'root' }),
      makeNode({ nodeId: 'left-child', parentId: 'left' }),
    ];
    const depths = computeDepths(nodes);
    expect(depths.get('left')).toBe(1);
    expect(depths.get('right')).toBe(1);
    expect(depths.get('left-child')).toBe(2);
  });

  it('handles nodes provided in non-topological order', () => {
    const nodes = [
      makeNode({ nodeId: 'c', parentId: 'b' }),
      makeNode({ nodeId: 'b', parentId: 'a' }),
      makeNode({ nodeId: 'a' }),
    ];
    const depths = computeDepths(nodes);
    expect(depths.get('a')).toBe(0);
    expect(depths.get('b')).toBe(1);
    expect(depths.get('c')).toBe(2);
  });
});

describe('toGraphNodes', () => {
  it('maps nodeId to id', () => {
    const nodes = [makeNode({ nodeId: 'n1' })];
    const result = toGraphNodes(nodes);
    expect(result[0].id).toBe('n1');
  });

  it('preserves type and content', () => {
    const nodes = [makeNode({ nodeId: 'n1', type: 'ai', content: 'Hello' })];
    const result = toGraphNodes(nodes);
    expect(result[0].type).toBe('ai');
    expect(result[0].content).toBe('Hello');
  });

  it('preserves isDeleted flag', () => {
    const nodes = [makeNode({ nodeId: 'n1', isDeleted: true })];
    const result = toGraphNodes(nodes);
    expect(result[0].isDeleted).toBe(true);
  });

  it('computes child counts correctly', () => {
    const nodes = [
      makeNode({ nodeId: 'root' }),
      makeNode({ nodeId: 'a', parentId: 'root' }),
      makeNode({ nodeId: 'b', parentId: 'root' }),
      makeNode({ nodeId: 'c', parentId: 'a' }),
    ];
    const result = toGraphNodes(nodes);
    const root = result.find((n) => n.id === 'root')!;
    const a = result.find((n) => n.id === 'a')!;
    const b = result.find((n) => n.id === 'b')!;
    const c = result.find((n) => n.id === 'c')!;

    expect(root.childCount).toBe(2);
    expect(a.childCount).toBe(1);
    expect(b.childCount).toBe(0);
    expect(c.childCount).toBe(0);
  });

  it('computes depths correctly', () => {
    const nodes = [
      makeNode({ nodeId: 'root' }),
      makeNode({ nodeId: 'a', parentId: 'root' }),
      makeNode({ nodeId: 'b', parentId: 'a' }),
    ];
    const result = toGraphNodes(nodes);
    expect(result.find((n) => n.id === 'root')!.depth).toBe(0);
    expect(result.find((n) => n.id === 'a')!.depth).toBe(1);
    expect(result.find((n) => n.id === 'b')!.depth).toBe(2);
  });

  it('maps metadata fields', () => {
    const nodes = [
      makeNode({
        nodeId: 'n1',
        modelName: 'claude-opus-4-6',
        provider: 'anthropic',
        tokenCount: 100,
        createdAt: '2026-04-01T00:00:00Z',
      }),
    ];
    const result = toGraphNodes(nodes);
    expect(result[0].metadata).toEqual({
      modelName: 'claude-opus-4-6',
      provider: 'anthropic',
      tokenCount: 100,
      createdAt: '2026-04-01T00:00:00Z',
    });
  });

  it('handles an empty array', () => {
    expect(toGraphNodes([])).toEqual([]);
  });

  it('handles all three node types', () => {
    const nodes = [
      makeNode({ nodeId: 'h', type: 'human' }),
      makeNode({ nodeId: 'a', type: 'ai', parentId: 'h' }),
      makeNode({ nodeId: 's', type: 'summary', parentId: 'h' }),
    ];
    const result = toGraphNodes(nodes);
    expect(result.map((n) => n.type)).toEqual(['human', 'ai', 'summary']);
  });
});
