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
  model: z.string().min(1).optional(),
  thinking: z.boolean().optional(),
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
    const { maxTokens, temperature, maxContextTokens, model, thinking } = c.req.valid('json');

    console.log(`[complete] treeId=${treeId} nodeId=${nodeId} maxTokens=${maxTokens}`);

    // Validate tree exists
    try {
      await c.var.repo.getTree(treeId);
    } catch {
      console.log(`[complete] tree not found: ${treeId}`);
      return c.json({ error: 'Tree not found' }, 404);
    }

    // Validate node exists and belongs to tree
    let targetNode: Node;
    try {
      targetNode = await c.var.repo.getNode(nodeId);
    } catch {
      console.log(`[complete] node not found: ${nodeId}`);
      return c.json({ error: 'Node not found' }, 404);
    }

    if (targetNode.treeId !== treeId) {
      console.log(`[complete] node ${nodeId} does not belong to tree ${treeId}`);
      return c.json({ error: 'Node not found' }, 404);
    }

    // Build conversation context
    const nodes = await c.var.repo.getNodes(treeId);
    const messages = buildContext(nodes, nodeId, { maxContextTokens });

    console.log(`[complete] context: ${messages.length} messages`);
    for (const msg of messages) {
      console.log(
        `  [${msg.role}] ${msg.content.slice(0, 80)}${msg.content.length > 80 ? '...' : ''}`,
      );
    }

    if (messages.length === 0) {
      console.log(`[complete] no context available`);
      return c.json({ error: 'No context available for completion' }, 400);
    }

    const config = {
      maxTokens,
      ...(temperature !== undefined && { temperature }),
      ...(model && { model }),
      ...(thinking !== undefined && { thinking }),
    };

    return streamSSE(c, async (stream) => {
      let thinkingContent = '';
      let responseContent = '';
      let chunkCount = 0;

      try {
        for await (const chunk of c.var.llm.stream(messages, config)) {
          chunkCount++;
          const text = typeof chunk === 'string' ? chunk : chunk.content;
          const thinking = typeof chunk === 'string' ? false : !!chunk.thinking;
          if (thinking) {
            thinkingContent += text;
          } else {
            responseContent += text;
          }
          await stream.writeSSE({
            event: 'delta',
            data: JSON.stringify({ content: text, ...(thinking && { thinking: true }) }),
          });
        }

        // Combine thinking + response for storage, wrapping thinking in a
        // collapsible <details> block.
        let content = '';
        if (thinkingContent.trim()) {
          content += `<details>\n<summary>Thinking</summary>\n\n${thinkingContent.trim()}\n\n</details>\n\n`;
        }
        content += responseContent;

        console.log(
          `[complete] stream finished: ${chunkCount} chunks, thinking=${thinkingContent.length} response=${responseContent.length}`,
        );

        // Write the AI node to the repository
        const aiNode: Node = {
          nodeId: crypto.randomUUID(),
          treeId,
          parentId: nodeId,
          type: 'ai',
          content,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          modelName: model ?? null,
          provider: null,
          tokenCount: null,
          embeddingModel: null,
          metadata: null,
          author: null,
        };

        await c.var.repo.putNode(aiNode);
        console.log(`[complete] saved AI node ${aiNode.nodeId}`);

        await stream.writeSSE({ event: 'done', data: JSON.stringify({ nodeId: aiNode.nodeId }) });
      } catch (err) {
        console.error(`[complete] streaming error:`, err);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        });
      }
    });
  });

  return app;
}
