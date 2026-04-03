import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { NodeRepository, LLMProvider, Node } from '@lineage/core';
import { buildContext } from '@lineage/core';

const completionBody = z.object({
  nodeId: z.string().min(1),
  maxTokens: z.number().int().positive(),
  temperature: z.number().min(0).max(2).optional(),
  maxContextTokens: z.number().int().positive().optional(),
});

export type Env = {
  Variables: {
    repo: NodeRepository;
    llm: LLMProvider;
  };
};

export function completionRoutes(repo: NodeRepository, llm: LLMProvider) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    c.set('llm', llm);
    await next();
  });

  // POST /trees/:treeId/nodes/:nodeId/complete — stream LLM completion as SSE
  app.post('/:nodeId/complete', zValidator('json', completionBody), async (c) => {
    const treeId = c.req.param('treeId') as string;
    const { nodeId } = c.req.param();
    const { maxTokens, temperature, maxContextTokens } = c.req.valid('json');

    // Validate tree exists
    try {
      await c.var.repo.getTree(treeId);
    } catch {
      return c.json({ error: 'Tree not found' }, 404);
    }

    // Validate node exists and belongs to tree
    let targetNode: Node;
    try {
      targetNode = await c.var.repo.getNode(nodeId);
    } catch {
      return c.json({ error: 'Node not found' }, 404);
    }

    if (targetNode.treeId !== treeId) {
      return c.json({ error: 'Node not found' }, 404);
    }

    // Build conversation context
    const nodes = await c.var.repo.getNodes(treeId);
    const messages = buildContext(nodes, nodeId, { maxContextTokens });

    if (messages.length === 0) {
      return c.json({ error: 'No context available for completion' }, 400);
    }

    const config = { maxTokens, ...(temperature !== undefined && { temperature }) };

    return streamSSE(c, async (stream) => {
      let content = '';

      for await (const chunk of c.var.llm.stream(messages, config)) {
        content += chunk;
        await stream.writeSSE({ event: 'delta', data: JSON.stringify({ content: chunk }) });
      }

      // Write the AI node to the repository
      const aiNode: Node = {
        nodeId: crypto.randomUUID(),
        treeId,
        parentId: nodeId,
        type: 'ai',
        content,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        modelName: null,
        provider: null,
        tokenCount: null,
        embeddingModel: null,
      };

      await c.var.repo.putNode(aiNode);

      await stream.writeSSE({ event: 'done', data: JSON.stringify({ nodeId: aiNode.nodeId }) });
    });
  });

  return app;
}
