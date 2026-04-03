import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { NodeRepository, LLMProvider, Node, Message } from '@lineage/core';

const summarizeBody = z.object({
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

const SUMMARIZE_SYSTEM_PROMPT = `You are a precise summarizer. The user will provide a conversation thread. Your task is to produce a concise summary that captures:
- The key decisions and conclusions reached
- Important constraints or requirements mentioned
- Any open questions or unresolved points

Write the summary as a single, dense paragraph. Do not use bullet points or headings. Do not begin with "This conversation" or "The discussion" — start directly with the substance.`;

export function summarizeRoutes(repo: NodeRepository, llm: LLMProvider) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    c.set('llm', llm);
    await next();
  });

  // POST /trees/:treeId/nodes/:nodeId/summarize — stream a summary as SSE
  app.post('/:nodeId/summarize', zValidator('json', summarizeBody), async (c) => {
    const treeId = c.req.param('treeId') as string;
    const { nodeId } = c.req.param();
    const { maxTokens, temperature } = c.req.valid('json');

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

    // Build conversation context from target node back to root (or nearest summary).
    // Unlike a normal completion, summarization stops at an existing summary node so
    // we only summarize the segment that hasn't been summarized yet.
    const nodes = await c.var.repo.getNodes(treeId);
    const nodesById = new Map(nodes.map((n) => [n.nodeId, n]));

    const path: Node[] = [];
    let cur: Node | undefined = nodesById.get(nodeId);
    while (cur) {
      if (cur.isDeleted) break;
      path.push(cur);
      // Stop when we reach an existing summary node (include it in the path)
      if (cur.type === 'summary' && cur.nodeId !== nodeId) break;
      cur = cur.parentId ? nodesById.get(cur.parentId) : undefined;
    }
    path.reverse();

    // Filter out empty root node and convert to messages
    const filtered = path.filter((n) => !(n.parentId === null && n.content === ''));

    function nodeTypeToRole(type: Node['type']): Message['role'] {
      return type === 'human' ? 'human' : 'ai';
    }

    const contextMessages: Message[] = filtered.map((n) => ({
      role: nodeTypeToRole(n.type),
      content: n.content,
    }));

    if (contextMessages.length === 0) {
      return c.json({ error: 'No context available for summarization' }, 400);
    }

    // Build the messages for the LLM: system prompt + conversation to summarize
    const conversationText = contextMessages
      .map((m) => `${m.role === 'human' ? 'Human' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const messages = [
      { role: 'system' as const, content: SUMMARIZE_SYSTEM_PROMPT },
      { role: 'human' as const, content: conversationText },
    ];

    const config = { maxTokens, ...(temperature !== undefined && { temperature }) };

    return streamSSE(c, async (stream) => {
      let content = '';

      for await (const chunk of c.var.llm.stream(messages, config)) {
        content += chunk;
        await stream.writeSSE({ event: 'delta', data: JSON.stringify({ content: chunk }) });
      }

      // Write the summary node to the repository
      const summaryNode: Node = {
        nodeId: crypto.randomUUID(),
        treeId,
        parentId: nodeId,
        type: 'summary',
        content,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        modelName: null,
        provider: null,
        tokenCount: null,
        embeddingModel: null,
      };

      await c.var.repo.putNode(summaryNode);

      await stream.writeSSE({
        event: 'done',
        data: JSON.stringify({ nodeId: summaryNode.nodeId }),
      });
    });
  });

  return app;
}
