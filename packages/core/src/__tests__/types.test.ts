import { describe, it, expect } from 'vitest';
import type { Node, NodeType, Tree } from '../index.js';

describe('Node type', () => {
  it('accepts a valid node', () => {
    const node: Node = {
      nodeId: '550e8400-e29b-41d4-a716-446655440000',
      treeId: '550e8400-e29b-41d4-a716-446655440001',
      parentId: null,
      type: 'human',
      content: 'Hello, world!',
      isDeleted: false,
      createdAt: '2026-04-03T00:00:00.000Z',
      modelName: null,
      provider: null,
      tokenCount: null,
      embeddingModel: null,
      metadata: null,
      author: null,
    };
    expect(node.nodeId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('accepts an ai node with model metadata', () => {
    const node: Node = {
      nodeId: '550e8400-e29b-41d4-a716-446655440002',
      treeId: '550e8400-e29b-41d4-a716-446655440001',
      parentId: '550e8400-e29b-41d4-a716-446655440000',
      type: 'ai',
      content: 'Hi there!',
      isDeleted: false,
      createdAt: '2026-04-03T00:00:01.000Z',
      modelName: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      tokenCount: 42,
      embeddingModel: null,
      metadata: null,
      author: null,
    };
    expect(node.type).toBe('ai');
    expect(node.parentId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('covers all NodeType variants', () => {
    const types: NodeType[] = ['human', 'ai', 'summary'];
    expect(types).toHaveLength(3);
  });
});

describe('Tree type', () => {
  it('accepts a valid tree', () => {
    const tree: Tree = {
      treeId: '550e8400-e29b-41d4-a716-446655440001',
      title: 'My conversation',
      createdAt: '2026-04-03T00:00:00.000Z',
      rootNodeId: '550e8400-e29b-41d4-a716-446655440000',
      contextSources: null,
    };
    expect(tree.treeId).toBe('550e8400-e29b-41d4-a716-446655440001');
  });
});
