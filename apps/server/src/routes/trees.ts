import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { NodeRepository, Tree } from '@lineage/core';

const createTreeBody = z.object({
  title: z.string().min(1),
  treeId: z.string().uuid().optional(),
  rootNodeId: z.string().uuid().optional(),
});

const updateTreeBody = z.object({
  title: z.string().min(1),
});

export type Env = {
  Variables: {
    repo: NodeRepository;
  };
};

export function treeRoutes(repo: NodeRepository) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    await next();
  });

  // GET /trees — list all trees
  app.get('/', async (c) => {
    const trees = await c.var.repo.listTrees();
    return c.json(trees);
  });

  // POST /trees — create a new tree
  app.post('/', zValidator('json', createTreeBody), async (c) => {
    const body = c.req.valid('json');
    const title = body.title;
    const treeId = body.treeId ?? crypto.randomUUID();
    const rootNodeId = body.rootNodeId ?? crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const tree: Tree = { treeId, title, createdAt, rootNodeId };
    await c.var.repo.putTree(tree);

    await c.var.repo.putNode({
      nodeId: rootNodeId,
      treeId,
      parentId: null,
      type: 'human',
      content: '',
      isDeleted: false,
      createdAt,
      modelName: null,
      provider: null,
      tokenCount: null,
      embeddingModel: null,
    });

    return c.json(tree, 201);
  });

  // GET /trees/:treeId — fetch tree metadata
  app.get('/:treeId', async (c) => {
    const { treeId } = c.req.param();
    try {
      const tree = await c.var.repo.getTree(treeId);
      return c.json(tree);
    } catch {
      return c.json({ error: 'Tree not found' }, 404);
    }
  });

  // PATCH /trees/:treeId — update title
  app.patch('/:treeId', zValidator('json', updateTreeBody), async (c) => {
    const { treeId } = c.req.param();
    const { title } = c.req.valid('json');

    let existing: Tree;
    try {
      existing = await c.var.repo.getTree(treeId);
    } catch {
      return c.json({ error: 'Tree not found' }, 404);
    }

    const updated: Tree = { ...existing, title };
    await c.var.repo.putTree(updated);
    return c.json(updated);
  });

  // DELETE /trees/:treeId — delete tree and all its nodes
  app.delete('/:treeId', async (c) => {
    const { treeId } = c.req.param();

    try {
      await c.var.repo.deleteTree(treeId);
    } catch {
      return c.json({ error: 'Tree not found' }, 404);
    }

    return c.body(null, 204);
  });

  return app;
}
