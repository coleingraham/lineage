import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepository } from '@lineage/adapter-sqlite';
import type { NodeRepository } from '@lineage/core';
import { createApp } from '../index.js';

function req(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  return app.request(path, init);
}

function jsonReq(app: ReturnType<typeof createApp>, path: string, body: unknown, method = 'POST') {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function createTree(app: ReturnType<typeof createApp>, title = 'Test Tree') {
  const res = await jsonReq(app, '/trees', { title });
  return res.json();
}

describe('node routes', () => {
  let repo: NodeRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    repo = new InMemoryRepository();
    app = createApp(repo);
  });

  describe('GET /trees/:treeId/nodes', () => {
    it('returns all nodes for a tree', async () => {
      const tree = await createTree(app);

      const res = await req(app, `/trees/${tree.treeId}/nodes`);
      expect(res.status).toBe(200);

      const nodes = await res.json();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].nodeId).toBe(tree.rootNodeId);
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await req(app, '/trees/non-existent-id/nodes');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /trees/:treeId/nodes', () => {
    it('creates a human node', async () => {
      const tree = await createTree(app);

      const res = await jsonReq(app, `/trees/${tree.treeId}/nodes`, {
        type: 'human',
        content: 'Hello world',
        parentId: tree.rootNodeId,
      });
      expect(res.status).toBe(201);

      const node = await res.json();
      expect(node.type).toBe('human');
      expect(node.content).toBe('Hello world');
      expect(node.treeId).toBe(tree.treeId);
      expect(node.parentId).toBe(tree.rootNodeId);
      expect(node.nodeId).toBeDefined();
      expect(node.createdAt).toBeDefined();
    });

    it('creates a summary node', async () => {
      const tree = await createTree(app);

      const res = await jsonReq(app, `/trees/${tree.treeId}/nodes`, {
        type: 'summary',
        content: 'A summary',
        parentId: tree.rootNodeId,
      });
      expect(res.status).toBe(201);

      const node = await res.json();
      expect(node.type).toBe('summary');
    });

    it('rejects ai type', async () => {
      const tree = await createTree(app);

      const res = await jsonReq(app, `/trees/${tree.treeId}/nodes`, {
        type: 'ai',
        content: 'AI response',
        parentId: tree.rootNodeId,
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing content', async () => {
      const tree = await createTree(app);

      const res = await jsonReq(app, `/trees/${tree.treeId}/nodes`, {
        type: 'human',
        parentId: tree.rootNodeId,
      });
      expect(res.status).toBe(400);
    });

    it('rejects missing parentId', async () => {
      const tree = await createTree(app);

      const res = await jsonReq(app, `/trees/${tree.treeId}/nodes`, {
        type: 'human',
        content: 'Hello',
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent tree', async () => {
      const tree = await createTree(app);

      const res = await jsonReq(app, '/trees/non-existent-id/nodes', {
        type: 'human',
        content: 'Hello',
        parentId: tree.rootNodeId,
      });
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent parent node', async () => {
      const tree = await createTree(app);

      const res = await jsonReq(app, `/trees/${tree.treeId}/nodes`, {
        type: 'human',
        content: 'Hello',
        parentId: 'non-existent-node-id',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /trees/:treeId/nodes/:nodeId', () => {
    it('soft deletes a node and returns 204', async () => {
      const tree = await createTree(app);

      // Create a child node to delete
      const createRes = await jsonReq(app, `/trees/${tree.treeId}/nodes`, {
        type: 'human',
        content: 'To delete',
        parentId: tree.rootNodeId,
      });
      const node = await createRes.json();

      const res = await app.request(`/trees/${tree.treeId}/nodes/${node.nodeId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(204);

      const deleted = await repo.getNode(node.nodeId);
      expect(deleted.isDeleted).toBe(true);
    });

    it('returns 404 for non-existent node', async () => {
      const tree = await createTree(app);

      const res = await app.request(`/trees/${tree.treeId}/nodes/non-existent-id`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request('/trees/non-existent-id/nodes/some-node-id', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });

    it('returns 404 when node belongs to a different tree', async () => {
      const tree1 = await createTree(app, 'Tree 1');
      const tree2 = await createTree(app, 'Tree 2');

      const createRes = await jsonReq(app, `/trees/${tree1.treeId}/nodes`, {
        type: 'human',
        content: 'Node in tree 1',
        parentId: tree1.rootNodeId,
      });
      const node = await createRes.json();

      const res = await app.request(`/trees/${tree2.treeId}/nodes/${node.nodeId}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });
});
