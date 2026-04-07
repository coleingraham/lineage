import { describe, it, expect } from 'vitest';
import { buildContext } from '../context.js';
import type { Node } from '../types.js';

function makeNode(overrides: Partial<Node> & Pick<Node, 'nodeId'>): Node {
  return {
    treeId: 'tree-1',
    parentId: null,
    type: 'human',
    content: 'hello',
    isDeleted: false,
    createdAt: '2026-01-01T00:00:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    metadata: null,
    author: null,
    ...overrides,
  };
}

describe('buildContext', () => {
  it('returns messages from root to target in order', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: 'hi', type: 'human' }),
      makeNode({ nodeId: 'a1', parentId: 'root', content: 'hello', type: 'ai' }),
      makeNode({ nodeId: 'h2', parentId: 'a1', content: 'thanks', type: 'human' }),
    ];

    const result = buildContext(nodes, 'h2');
    expect(result).toEqual([
      { role: 'human', content: 'hi' },
      { role: 'ai', content: 'hello' },
      { role: 'human', content: 'thanks' },
    ]);
  });

  it('excludes the empty root node', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: '', type: 'human' }),
      makeNode({ nodeId: 'h1', parentId: 'root', content: 'hi', type: 'human' }),
    ];

    const result = buildContext(nodes, 'h1');
    expect(result).toEqual([{ role: 'human', content: 'hi' }]);
  });

  it('maps summary nodes to ai role and treats them as context boundaries', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: 'start', type: 'human' }),
      makeNode({ nodeId: 's1', parentId: 'root', content: 'summary text', type: 'summary' }),
      makeNode({ nodeId: 'h2', parentId: 's1', content: 'follow-up', type: 'human' }),
    ];

    // When targeting the summary itself, only the summary is context
    expect(buildContext(nodes, 's1')).toEqual([{ role: 'ai', content: 'summary text' }]);

    // When targeting a child of the summary, context starts at the summary
    expect(buildContext(nodes, 'h2')).toEqual([
      { role: 'ai', content: 'summary text' },
      { role: 'human', content: 'follow-up' },
    ]);
  });

  it('stops at deleted nodes', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: 'hi', type: 'human' }),
      makeNode({ nodeId: 'a1', parentId: 'root', content: 'resp', type: 'ai', isDeleted: true }),
      makeNode({ nodeId: 'h2', parentId: 'a1', content: 'follow-up', type: 'human' }),
    ];

    const result = buildContext(nodes, 'h2');
    // only the segment below the deleted node
    expect(result).toEqual([{ role: 'human', content: 'follow-up' }]);
  });

  it('returns empty array for unknown target node', () => {
    const nodes: Node[] = [makeNode({ nodeId: 'root', content: 'hi' })];
    expect(buildContext(nodes, 'nonexistent')).toEqual([]);
  });

  it('follows the correct branch in a tree with multiple children', () => {
    const nodes: Node[] = [
      makeNode({ nodeId: 'root', content: '', type: 'human' }),
      makeNode({ nodeId: 'h1', parentId: 'root', content: 'branch A', type: 'human' }),
      makeNode({ nodeId: 'h2', parentId: 'root', content: 'branch B', type: 'human' }),
      makeNode({ nodeId: 'a1', parentId: 'h1', content: 'response A', type: 'ai' }),
    ];

    const result = buildContext(nodes, 'a1');
    expect(result).toEqual([
      { role: 'human', content: 'branch A' },
      { role: 'ai', content: 'response A' },
    ]);
  });

  describe('token budgeting', () => {
    it('drops oldest messages when over budget', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'root', content: 'old', type: 'human', tokenCount: 100 }),
        makeNode({ nodeId: 'a1', parentId: 'root', content: 'mid', type: 'ai', tokenCount: 100 }),
        makeNode({
          nodeId: 'h2',
          parentId: 'a1',
          content: 'new',
          type: 'human',
          tokenCount: 100,
        }),
      ];

      const result = buildContext(nodes, 'h2', { maxContextTokens: 200 });
      expect(result).toEqual([
        { role: 'ai', content: 'mid' },
        { role: 'human', content: 'new' },
      ]);
    });

    it('keeps all messages when within budget', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'root', content: 'a', type: 'human', tokenCount: 10 }),
        makeNode({ nodeId: 'a1', parentId: 'root', content: 'b', type: 'ai', tokenCount: 10 }),
      ];

      const result = buildContext(nodes, 'a1', { maxContextTokens: 100 });
      expect(result).toHaveLength(2);
    });

    it('always keeps at least the last message', () => {
      const nodes: Node[] = [
        makeNode({ nodeId: 'root', content: 'a', type: 'human', tokenCount: 500 }),
        makeNode({ nodeId: 'h1', parentId: 'root', content: 'b', type: 'human', tokenCount: 500 }),
      ];

      const result = buildContext(nodes, 'h1', { maxContextTokens: 10 });
      expect(result).toEqual([{ role: 'human', content: 'b' }]);
    });
  });
});
