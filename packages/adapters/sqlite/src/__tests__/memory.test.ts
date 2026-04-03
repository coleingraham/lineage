import { describe, it, expect, beforeEach } from 'vitest';
import type { Node, Tree } from '@lineage/core';
import { InMemoryRepository } from '../memory.js';

function makeTree(overrides: Partial<Tree> = {}): Tree {
  return {
    treeId: 'tree-1',
    title: 'Test tree',
    createdAt: '2026-04-03T00:00:00.000Z',
    rootNodeId: 'node-1',
    ...overrides,
  };
}

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    nodeId: 'node-1',
    treeId: 'tree-1',
    parentId: null,
    type: 'human',
    content: 'Hello',
    isDeleted: false,
    createdAt: '2026-04-03T00:00:00.000Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
    ...overrides,
  };
}

describe('InMemoryRepository', () => {
  let repo: InMemoryRepository;

  beforeEach(() => {
    repo = new InMemoryRepository();
  });

  describe('trees', () => {
    it('puts and gets a tree', async () => {
      const tree = makeTree();
      await repo.putTree(tree);
      expect(await repo.getTree('tree-1')).toEqual(tree);
    });

    it('throws on missing tree', async () => {
      await expect(repo.getTree('missing')).rejects.toThrow('Tree not found: missing');
    });

    it('lists all trees', async () => {
      await repo.putTree(makeTree({ treeId: 'a' }));
      await repo.putTree(makeTree({ treeId: 'b' }));
      const trees = await repo.listTrees();
      expect(trees).toHaveLength(2);
    });

    it('overwrites a tree with the same id', async () => {
      await repo.putTree(makeTree({ title: 'v1' }));
      await repo.putTree(makeTree({ title: 'v2' }));
      expect((await repo.getTree('tree-1')).title).toBe('v2');
    });
  });

  describe('nodes', () => {
    it('puts and gets a node', async () => {
      const node = makeNode();
      await repo.putNode(node);
      expect(await repo.getNode('node-1')).toEqual(node);
    });

    it('throws on missing node', async () => {
      await expect(repo.getNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('gets nodes by treeId', async () => {
      await repo.putNode(makeNode({ nodeId: 'n1', treeId: 'tree-1' }));
      await repo.putNode(makeNode({ nodeId: 'n2', treeId: 'tree-1' }));
      await repo.putNode(makeNode({ nodeId: 'n3', treeId: 'tree-2' }));
      expect(await repo.getNodes('tree-1')).toHaveLength(2);
      expect(await repo.getNodes('tree-2')).toHaveLength(1);
    });

    it('soft deletes a node', async () => {
      await repo.putNode(makeNode());
      await repo.softDeleteNode('node-1');
      const node = await repo.getNode('node-1');
      expect(node.isDeleted).toBe(true);
    });

    it('throws when soft deleting a missing node', async () => {
      await expect(repo.softDeleteNode('missing')).rejects.toThrow('Node not found: missing');
    });

    it('overwrites a node with the same id', async () => {
      await repo.putNode(makeNode({ content: 'v1' }));
      await repo.putNode(makeNode({ content: 'v2' }));
      expect((await repo.getNode('node-1')).content).toBe('v2');
    });
  });

  describe('updateNodeEmbedding', () => {
    it('is a silent no-op', async () => {
      await expect(repo.updateNodeEmbedding('any', [1, 2, 3], 'model')).resolves.toBeUndefined();
    });
  });
});
