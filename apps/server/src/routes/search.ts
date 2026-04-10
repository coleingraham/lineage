import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { NodeRepository, EmbeddingProvider, Node } from '@lineage/core';

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

const semanticSearchBody = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().optional(),
  ancestorDepth: z.number().int().min(0).optional(),
});

type SemanticSearchEnv = {
  Variables: {
    repo: NodeRepository;
    embedding: EmbeddingProvider;
  };
};

export function semanticSearchRoutes(repo: NodeRepository, embedding: EmbeddingProvider) {
  const app = new Hono<SemanticSearchEnv>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    c.set('embedding', embedding);
    await next();
  });

  // POST /trees/:treeId/search — semantic search within a tree
  app.post('/', zValidator('json', semanticSearchBody), async (c) => {
    const treeId = c.req.param('treeId') as string;
    const { query, limit, ancestorDepth = 3 } = c.req.valid('json');

    // Validate tree exists
    try {
      await c.var.repo.getTree(treeId);
    } catch {
      return c.json({ error: 'Tree not found' }, 404);
    }

    // Check backend supports semantic search
    let results;
    try {
      const [queryEmbedding] = await c.var.embedding.embed([query]);
      results = await c.var.repo.semanticSearch({
        embedding: queryEmbedding,
        treeId,
        limit,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('not supported')) {
        return c.json({ error: 'Semantic search is not supported by the configured backend' }, 501);
      }
      throw err;
    }

    // Build ancestor context for each result
    const allNodes = await c.var.repo.getNodes(treeId);
    const nodeMap = new Map<string, Node>(allNodes.map((n) => [n.nodeId, n]));

    const enriched = results.map((r) => {
      const context: Node[] = [];
      let current = r.node.parentId ? nodeMap.get(r.node.parentId) : undefined;
      for (let depth = 0; depth < ancestorDepth && current; depth++) {
        context.push(current);
        current = current.parentId ? nodeMap.get(current.parentId) : undefined;
      }
      return { node: r.node, score: r.score, context };
    });

    return c.json({ results: enriched });
  });

  return app;
}
