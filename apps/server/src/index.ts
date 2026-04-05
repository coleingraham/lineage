import { Hono } from 'hono';
import type { NodeRepository, LLMProvider } from '@lineage/core';
import { treeRoutes } from './routes/trees.js';
import { nodeRoutes } from './routes/nodes.js';
import { completionRoutes } from './routes/completion.js';
import { summarizeRoutes } from './routes/summarize.js';
import { titleRoutes } from './routes/title.js';

export interface CreateAppOptions {
  repo: NodeRepository;
  llm?: LLMProvider;
}

export function createApp(repo: NodeRepository, llm?: LLMProvider): Hono;
export function createApp(options: CreateAppOptions): Hono;
export function createApp(repoOrOptions: NodeRepository | CreateAppOptions, llm?: LLMProvider) {
  let repo: NodeRepository;
  let provider: LLMProvider | undefined;

  if ('repo' in (repoOrOptions as CreateAppOptions)) {
    const options = repoOrOptions as CreateAppOptions;
    repo = options.repo;
    provider = options.llm;
  } else {
    repo = repoOrOptions as NodeRepository;
    provider = llm;
  }

  const app = new Hono();
  app.route('/trees', treeRoutes(repo));
  app.route('/trees/:treeId/nodes', nodeRoutes(repo));

  if (provider) {
    app.route('/trees/:treeId/nodes', completionRoutes(repo, provider));
    app.route('/trees/:treeId/nodes', summarizeRoutes(repo, provider));
    app.route('/trees/:treeId/generate-title', titleRoutes(repo, provider));
  }

  return app;
}

export { treeRoutes } from './routes/trees.js';
export { nodeRoutes } from './routes/nodes.js';
export { completionRoutes } from './routes/completion.js';
export { summarizeRoutes } from './routes/summarize.js';
export { titleRoutes } from './routes/title.js';
