import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { stripThinking } from '@lineage/core';
import type { NodeRepository, LLMProvider } from '@lineage/core';

const titleBody = z.object({
  content: z.string().min(1),
  model: z.string().min(1).optional(),
});

export type Env = {
  Variables: {
    repo: NodeRepository;
    llm: LLMProvider;
  };
};

export function titleRoutes(repo: NodeRepository, llm: LLMProvider) {
  const app = new Hono<Env>();

  app.use('*', async (c, next) => {
    c.set('repo', repo);
    c.set('llm', llm);
    await next();
  });

  // POST /trees/:treeId/generate-title — generate a short title from content
  app.post('/', zValidator('json', titleBody), async (c) => {
    const { content, model } = c.req.valid('json');

    const messages = [
      {
        role: 'system' as const,
        content:
          'Generate a very short title (2-5 words) for a conversation that starts with the following message. Respond with only the title, no quotes or punctuation.',
      },
      { role: 'human' as const, content },
    ];

    try {
      let thinkingContent = '';
      let responseContent = '';
      for await (const chunk of c.var.llm.stream(messages, {
        maxTokens: 256,
        thinking: false,
        ...(model && { model }),
      })) {
        if (typeof chunk === 'string') {
          responseContent += chunk;
        } else if (chunk.thinking) {
          thinkingContent += chunk.content;
        } else {
          responseContent += chunk.content;
        }
      }
      // Use response content if available, otherwise strip thinking markup from thinking content
      const raw = responseContent || stripThinking(thinkingContent);
      const cleaned = raw
        .replace(/^["']|["']$/g, '')
        .replace(/\.+$/, '')
        .trim();
      console.log(
        `[generate-title] response="${responseContent}" thinking="${thinkingContent.slice(0, 80)}" cleaned="${cleaned}"`,
      );
      return c.json({ title: cleaned });
    } catch (e) {
      console.error('[generate-title] failed:', e);
      return c.json({ error: 'Title generation failed' }, 500);
    }
  });

  return app;
}
