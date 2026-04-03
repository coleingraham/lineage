import { Hono } from 'hono';
import type { NodeRepository } from '@lineage/core';
import { treeRoutes } from './routes/trees.js';
import { nodeRoutes } from './routes/nodes.js';

export function createApp(repo: NodeRepository) {
  const app = new Hono();
  app.route('/trees', treeRoutes(repo));
  app.route('/trees/:treeId/nodes', nodeRoutes(repo));
  return app;
}

export { treeRoutes } from './routes/trees.js';
export { nodeRoutes } from './routes/nodes.js';
