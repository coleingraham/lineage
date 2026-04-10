import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { NodeRepository, Tag, TagCategory } from '@lineage/core';

export type Env = {
  Variables: {
    repo: NodeRepository;
  };
};

// ── Validation schemas ──

const createCategoryBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateCategoryBody = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: 'At least one of name or description must be provided',
  });

const createTagBody = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateTagBody = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .refine((data) => data.name !== undefined || data.description !== undefined, {
    message: 'At least one of name or description must be provided',
  });

const tagIdsBody = z.object({
  tagIds: z.array(z.string().min(1)).min(1),
});

const searchQuery = z.object({
  tagIds: z.string().min(1),
  scope: z.enum(['nodes', 'trees', 'all']).optional().default('all'),
  treeId: z.string().optional(),
});

// ── Category & tag routes (mounted at / — caller provides base paths) ──

export function tagRoutes(repo: NodeRepository) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    await next();
  });

  // ── Categories ──

  // GET /categories
  app.get('/categories', async (c) => {
    const categories = await c.var.repo.listCategories();
    return c.json(categories);
  });

  // POST /categories
  app.post('/categories', zValidator('json', createCategoryBody), async (c) => {
    const body = c.req.valid('json');
    const category: TagCategory = {
      categoryId: crypto.randomUUID(),
      name: body.name,
      description: body.description ?? '',
      createdAt: new Date().toISOString(),
    };
    await c.var.repo.createCategory(category);
    return c.json(category, 201);
  });

  // GET /categories/:categoryId
  app.get('/categories/:categoryId', async (c) => {
    const { categoryId } = c.req.param();
    try {
      const category = await c.var.repo.getCategory(categoryId);
      return c.json(category);
    } catch {
      return c.json({ error: 'Category not found' }, 404);
    }
  });

  // PATCH /categories/:categoryId
  app.patch('/categories/:categoryId', zValidator('json', updateCategoryBody), async (c) => {
    const { categoryId } = c.req.param();
    const body = c.req.valid('json');

    try {
      await c.var.repo.getCategory(categoryId);
    } catch {
      return c.json({ error: 'Category not found' }, 404);
    }

    await c.var.repo.updateCategory(categoryId, body);
    const updated = await c.var.repo.getCategory(categoryId);
    return c.json(updated);
  });

  // DELETE /categories/:categoryId
  app.delete('/categories/:categoryId', async (c) => {
    const { categoryId } = c.req.param();

    try {
      await c.var.repo.getCategory(categoryId);
    } catch {
      return c.json({ error: 'Category not found' }, 404);
    }

    // Check if the category still has tags
    const tags = await c.var.repo.listTags(categoryId);
    if (tags.length > 0) {
      return c.json({ error: 'Category still has tags' }, 400);
    }

    await c.var.repo.deleteCategory(categoryId);
    return c.body(null, 204);
  });

  // ── Tags ──

  // GET /tags
  app.get('/tags', async (c) => {
    const categoryId = c.req.query('categoryId');
    const tags = await c.var.repo.listTags(categoryId);
    return c.json(tags);
  });

  // GET /tags/search — must be before /tags/:tagId so it doesn't match as a param
  app.get('/tags/search', zValidator('query', searchQuery), async (c) => {
    const { tagIds: tagIdsStr, scope, treeId } = c.req.valid('query');
    const tagIds = tagIdsStr.split(',').map((id) => id.trim());

    const result: { nodes?: unknown[]; trees?: unknown[] } = {};

    if (scope === 'nodes' || scope === 'all') {
      result.nodes = await c.var.repo.findNodesByTags(tagIds, treeId ? { treeId } : undefined);
    }
    if (scope === 'trees' || scope === 'all') {
      result.trees = await c.var.repo.findTreesByTags(tagIds);
    }

    return c.json(result);
  });

  // POST /tags
  app.post('/tags', zValidator('json', createTagBody), async (c) => {
    const body = c.req.valid('json');
    const tag: Tag = {
      tagId: crypto.randomUUID(),
      categoryId: body.categoryId,
      name: body.name,
      description: body.description ?? '',
      createdAt: new Date().toISOString(),
    };
    await c.var.repo.createTag(tag);
    return c.json(tag, 201);
  });

  // GET /tags/:tagId
  app.get('/tags/:tagId', async (c) => {
    const { tagId } = c.req.param();
    try {
      const tag = await c.var.repo.getTag(tagId);
      return c.json(tag);
    } catch {
      return c.json({ error: 'Tag not found' }, 404);
    }
  });

  // PATCH /tags/:tagId
  app.patch('/tags/:tagId', zValidator('json', updateTagBody), async (c) => {
    const { tagId } = c.req.param();
    const body = c.req.valid('json');

    try {
      await c.var.repo.getTag(tagId);
    } catch {
      return c.json({ error: 'Tag not found' }, 404);
    }

    await c.var.repo.updateTag(tagId, body);
    const updated = await c.var.repo.getTag(tagId);
    return c.json(updated);
  });

  // DELETE /tags/:tagId
  app.delete('/tags/:tagId', async (c) => {
    const { tagId } = c.req.param();
    await c.var.repo.deleteTag(tagId);
    return c.body(null, 204);
  });

  return app;
}

// ── Node tag routes (mounted at /nodes/:nodeId/tags) ──

export function nodeTagRoutes(repo: NodeRepository) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    await next();
  });

  // GET /nodes/:nodeId/tags
  app.get('/', async (c) => {
    const nodeId = c.req.param('nodeId') as string;
    const tags = await c.var.repo.getNodeTags(nodeId);
    return c.json(tags);
  });

  // POST /nodes/:nodeId/tags
  app.post('/', zValidator('json', tagIdsBody), async (c) => {
    const nodeId = c.req.param('nodeId') as string;
    const { tagIds } = c.req.valid('json');
    await c.var.repo.tagNode(nodeId, tagIds);
    const tags = await c.var.repo.getNodeTags(nodeId);
    return c.json(tags);
  });

  // DELETE /nodes/:nodeId/tags
  app.delete('/', zValidator('json', tagIdsBody), async (c) => {
    const nodeId = c.req.param('nodeId') as string;
    const { tagIds } = c.req.valid('json');
    await c.var.repo.untagNode(nodeId, tagIds);
    const tags = await c.var.repo.getNodeTags(nodeId);
    return c.json(tags);
  });

  return app;
}

// ── Tree tag routes (mounted at /trees/:treeId/tags) ──

export function treeTagRoutes(repo: NodeRepository) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    await next();
  });

  // GET /trees/:treeId/tags
  app.get('/', async (c) => {
    const treeId = c.req.param('treeId') as string;
    const tags = await c.var.repo.getTreeTags(treeId);
    return c.json(tags);
  });

  // POST /trees/:treeId/tags
  app.post('/', zValidator('json', tagIdsBody), async (c) => {
    const treeId = c.req.param('treeId') as string;
    const { tagIds } = c.req.valid('json');
    await c.var.repo.tagTree(treeId, tagIds);
    const tags = await c.var.repo.getTreeTags(treeId);
    return c.json(tags);
  });

  // DELETE /trees/:treeId/tags
  app.delete('/', zValidator('json', tagIdsBody), async (c) => {
    const treeId = c.req.param('treeId') as string;
    const { tagIds } = c.req.valid('json');
    await c.var.repo.untagTree(treeId, tagIds);
    const tags = await c.var.repo.getTreeTags(treeId);
    return c.json(tags);
  });

  return app;
}
