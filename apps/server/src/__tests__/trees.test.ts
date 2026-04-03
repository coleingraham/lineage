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

describe('tree routes', () => {
  let repo: NodeRepository;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    repo = new InMemoryRepository();
    app = createApp(repo);
  });

  describe('GET /trees', () => {
    it('returns empty array when no trees exist', async () => {
      const res = await req(app, '/trees');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('returns all trees', async () => {
      await jsonReq(app, '/trees', { title: 'Tree 1' });
      await jsonReq(app, '/trees', { title: 'Tree 2' });

      const res = await req(app, '/trees');
      const trees = await res.json();
      expect(trees).toHaveLength(2);
    });
  });

  describe('POST /trees', () => {
    it('creates a tree with root node', async () => {
      const res = await jsonReq(app, '/trees', { title: 'My Tree' });
      expect(res.status).toBe(201);

      const tree = await res.json();
      expect(tree.title).toBe('My Tree');
      expect(tree.treeId).toBeDefined();
      expect(tree.rootNodeId).toBeDefined();
      expect(tree.createdAt).toBeDefined();

      // root node should exist
      const rootNode = await repo.getNode(tree.rootNodeId);
      expect(rootNode.treeId).toBe(tree.treeId);
      expect(rootNode.parentId).toBeNull();
    });

    it('rejects missing title', async () => {
      const res = await jsonReq(app, '/trees', {});
      expect(res.status).toBe(400);
    });

    it('rejects empty title', async () => {
      const res = await jsonReq(app, '/trees', { title: '' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /trees/:treeId', () => {
    it('returns a tree by id', async () => {
      const createRes = await jsonReq(app, '/trees', { title: 'Test' });
      const created = await createRes.json();

      const res = await req(app, `/trees/${created.treeId}`);
      expect(res.status).toBe(200);

      const tree = await res.json();
      expect(tree.treeId).toBe(created.treeId);
      expect(tree.title).toBe('Test');
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await req(app, '/trees/non-existent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /trees/:treeId', () => {
    it('updates the title', async () => {
      const createRes = await jsonReq(app, '/trees', { title: 'Old Title' });
      const created = await createRes.json();

      const res = await jsonReq(app, `/trees/${created.treeId}`, { title: 'New Title' }, 'PATCH');
      expect(res.status).toBe(200);

      const updated = await res.json();
      expect(updated.title).toBe('New Title');
      expect(updated.treeId).toBe(created.treeId);
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await jsonReq(app, '/trees/non-existent-id', { title: 'X' }, 'PATCH');
      expect(res.status).toBe(404);
    });

    it('rejects empty title', async () => {
      const createRes = await jsonReq(app, '/trees', { title: 'Test' });
      const created = await createRes.json();

      const res = await jsonReq(app, `/trees/${created.treeId}`, { title: '' }, 'PATCH');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /trees/:treeId', () => {
    it('soft deletes all nodes and returns 204', async () => {
      const createRes = await jsonReq(app, '/trees', { title: 'To Delete' });
      const created = await createRes.json();

      const res = await app.request(`/trees/${created.treeId}`, { method: 'DELETE' });
      expect(res.status).toBe(204);

      // root node should be soft-deleted
      const rootNode = await repo.getNode(created.rootNodeId);
      expect(rootNode.isDeleted).toBe(true);
    });

    it('returns 404 for non-existent tree', async () => {
      const res = await app.request('/trees/non-existent-id', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });
});
