import { Hono } from 'hono';
import type { NodeRepository } from '@lineage/core';
import { treeRoutes } from './routes/trees.js';

export function createApp(repo: NodeRepository) {
  const app = new Hono();
  app.route('/trees', treeRoutes(repo));
  return app;
}

export { treeRoutes } from './routes/trees.js';
