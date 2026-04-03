import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { NodeRepository, Node } from '@lineage/core';

const createNodeBody = z.object({
  type: z.enum(['human', 'summary']),
  content: z.string(),
  parentId: z.string().min(1),
});

export type Env = {
  Variables: {
    repo: NodeRepository;
  };
};

export function nodeRoutes(repo: NodeRepository) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    await next();
  });

  // GET /trees/:treeId/nodes — fetch all nodes for a tree
  app.get('/', async (c) => {
    const treeId = c.req.param('treeId') as string;

    try {
      await c.var.repo.getTree(treeId);
    } catch {
      return c.json({ error: 'Tree not found' }, 404);
    }

    const nodes = await c.var.repo.getNodes(treeId);
    return c.json(nodes);
  });

  // POST /trees/:treeId/nodes — create a node
  app.post('/', zValidator('json', createNodeBody), async (c) => {
    const treeId = c.req.param('treeId') as string;
    const { type, content, parentId } = c.req.valid('json');

    try {
      await c.var.repo.getTree(treeId);
    } catch {
      return c.json({ error: 'Tree not found' }, 404);
    }

    try {
      await c.var.repo.getNode(parentId);
    } catch {
      return c.json({ error: 'Parent node not found' }, 404);
    }

    const node: Node = {
      nodeId: crypto.randomUUID(),
      treeId,
      parentId,
      type,
      content,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      modelName: null,
      provider: null,
      tokenCount: null,
      embeddingModel: null,
    };

    await c.var.repo.putNode(node);
    return c.json(node, 201);
  });

  // DELETE /trees/:treeId/nodes/:nodeId — soft delete a node
  app.delete('/:nodeId', async (c) => {
    const { nodeId } = c.req.param();
    const treeId = c.req.param('treeId') as string;

    try {
      await c.var.repo.getTree(treeId);
    } catch {
      return c.json({ error: 'Tree not found' }, 404);
    }

    let node: Node;
    try {
      node = await c.var.repo.getNode(nodeId);
    } catch {
      return c.json({ error: 'Node not found' }, 404);
    }

    if (node.treeId !== treeId) {
      return c.json({ error: 'Node not found' }, 404);
    }

    await c.var.repo.softDeleteNode(nodeId);
    return c.body(null, 204);
  });

  return app;
}
