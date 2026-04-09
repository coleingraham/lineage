import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { NodeRepository } from '@lineage/core';

const searchQuery = z.object({
  q: z.string().min(1),
  types: z.string().optional(),
  treeId: z.string().optional(),
});

export function searchRoutes(repo: NodeRepository) {
  const app = new Hono();

  // GET /search?q=<query>&types=<comma-separated>&treeId=<optional>
  app.get('/', zValidator('query', searchQuery), async (c) => {
    const { q, types, treeId } = c.req.valid('query');
    const nodeTypes = types ? types.split(',').filter(Boolean) : undefined;

    const [trees, nodes] = await Promise.all([
      repo.searchTrees(q),
      repo.searchNodes({ query: q, nodeTypes, treeId }),
    ]);

    return c.json({ trees, nodes });
  });

  return app;
}
