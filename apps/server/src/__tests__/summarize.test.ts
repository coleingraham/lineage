import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryRepository } from '@lineage/adapter-sqlite';
import type { NodeRepository, LLMProvider } from '@lineage/core';
import { createApp } from '../index.js';

function jsonReq(app: ReturnType<typeof createApp>, path: string, body: unknown, method = 'POST') {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function createTree(app: ReturnType<typeof createApp>, title = 'Test Tree') {
  const res = await jsonReq(app, '/trees', { title });
  return res.json();
}

async function createNode(
  app: ReturnType<typeof createApp>,
  treeId: string,
  parentId: string,
  content: string,
  type: 'human' | 'summary' = 'human',
) {
  const res = await jsonReq(app, `/trees/${treeId}/nodes`, {
    type,
    content,
    parentId,
  });
  return res.json();
}

function makeMockLLM(chunks: string[]): LLMProvider {
  return {
    complete: vi.fn(async () => chunks.join('')),
    stream: vi.fn(async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    }),
  };
}

async function readSSEEvents(response: Response): Promise<Array<{ event: string; data: string }>> {
  const text = await response.text();
  const events: Array<{ event: string; data: string }> = [];
  const rawEvents = text.split('\n\n').filter((block) => block.trim());

  for (const block of rawEvents) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7);
      if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event && data) {
      events.push({ event, data });
    }
  }

  return events;
}

describe('summarize routes', () => {
  let repo: NodeRepository;
  let llm: LLMProvider;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    repo = new InMemoryRepository();
    llm = makeMockLLM(['A concise', ' summary', ' of the conversation.']);
    app = createApp(repo, llm);
  });

  it('streams SSE delta events and a done event', async () => {
    const tree = await createTree(app);
    const node = await createNode(app, tree.treeId, tree.rootNodeId, 'First message');

    const res = await jsonReq(app, `/trees/${tree.treeId}/nodes/${node.nodeId}/summarize`, {
      nodeId: node.nodeId,
      maxTokens: 200,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const events = await readSSEEvents(res);

    const deltas = events.filter((e) => e.event === 'delta');
    expect(deltas).toHaveLength(3);
    expect(JSON.parse(deltas[0].data)).toEqual({ content: 'A concise' });
    expect(JSON.parse(deltas[1].data)).toEqual({ content: ' summary' });
    expect(JSON.parse(deltas[2].data)).toEqual({ content: ' of the conversation.' });

    const doneEvents = events.filter((e) => e.event === 'done');
    expect(doneEvents).toHaveLength(1);
    const doneData = JSON.parse(doneEvents[0].data);
    expect(doneData.nodeId).toBeDefined();
  });

  it('writes a summary node to the repository on completion', async () => {
    const tree = await createTree(app);
    const node = await createNode(app, tree.treeId, tree.rootNodeId, 'Discussion content');

    const res = await jsonReq(app, `/trees/${tree.treeId}/nodes/${node.nodeId}/summarize`, {
      nodeId: node.nodeId,
      maxTokens: 200,
    });

    const events = await readSSEEvents(res);
    const doneData = JSON.parse(events.find((e) => e.event === 'done')!.data);

    const summaryNode = await repo.getNode(doneData.nodeId);
    expect(summaryNode.type).toBe('summary');
    expect(summaryNode.content).toBe('A concise summary of the conversation.');
    expect(summaryNode.parentId).toBe(node.nodeId);
    expect(summaryNode.treeId).toBe(tree.treeId);
  });

  it('passes system prompt and conversation context to the LLM', async () => {
    const tree = await createTree(app);
    const node = await createNode(app, tree.treeId, tree.rootNodeId, 'What is testing?');

    await jsonReq(app, `/trees/${tree.treeId}/nodes/${node.nodeId}/summarize`, {
      nodeId: node.nodeId,
      maxTokens: 200,
      temperature: 0.3,
    });

    expect(llm.stream).toHaveBeenCalledTimes(1);
    const [messages, config] = (llm.stream as ReturnType<typeof vi.fn>).mock.calls[0];

    // First message should be the system prompt
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('summarizer');

    // Second message should contain the conversation
    expect(messages[1].role).toBe('human');
    expect(messages[1].content).toContain('What is testing?');

    expect(config).toEqual({ maxTokens: 200, temperature: 0.3 });
  });

  it('returns 404 for non-existent tree', async () => {
    const res = await jsonReq(app, '/trees/nonexistent/nodes/some-node/summarize', {
      nodeId: 'some-node',
      maxTokens: 100,
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent node', async () => {
    const tree = await createTree(app);

    const res = await jsonReq(app, `/trees/${tree.treeId}/nodes/nonexistent/summarize`, {
      nodeId: 'nonexistent',
      maxTokens: 100,
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    const tree = await createTree(app);

    const res = await jsonReq(app, `/trees/${tree.treeId}/nodes/${tree.rootNodeId}/summarize`, {
      nodeId: tree.rootNodeId,
    });
    expect(res.status).toBe(400);
  });

  it('stops context at the nearest ancestor summary node', async () => {
    // Build: root -> h1 -> summary1 -> h2 -> h3
    // Summarizing h3 should only include summary1, h2, h3 (not root or h1)
    const tree = await createTree(app);
    const h1 = await createNode(app, tree.treeId, tree.rootNodeId, 'First message');
    const summary1 = await createNode(
      app,
      tree.treeId,
      h1.nodeId,
      'Summary of first part',
      'summary',
    );
    const h2 = await createNode(app, tree.treeId, summary1.nodeId, 'Second message');
    const h3 = await createNode(app, tree.treeId, h2.nodeId, 'Third message');

    await jsonReq(app, `/trees/${tree.treeId}/nodes/${h3.nodeId}/summarize`, {
      nodeId: h3.nodeId,
      maxTokens: 200,
    });

    expect(llm.stream).toHaveBeenCalledTimes(1);
    const [messages] = (llm.stream as ReturnType<typeof vi.fn>).mock.calls[0];
    const conversationText: string = messages[1].content;

    // Should include summary1, h2, h3
    expect(conversationText).toContain('Summary of first part');
    expect(conversationText).toContain('Second message');
    expect(conversationText).toContain('Third message');

    // Should NOT include content from before the summary
    expect(conversationText).not.toContain('First message');
  });

  it('includes full path to root when no ancestor summary exists', async () => {
    // Build: root -> h1 -> h2
    // Summarizing h2 should include h1 and h2 (full path, no summary to stop at)
    const tree = await createTree(app);
    const h1 = await createNode(app, tree.treeId, tree.rootNodeId, 'First message');
    const h2 = await createNode(app, tree.treeId, h1.nodeId, 'Second message');

    await jsonReq(app, `/trees/${tree.treeId}/nodes/${h2.nodeId}/summarize`, {
      nodeId: h2.nodeId,
      maxTokens: 200,
    });

    expect(llm.stream).toHaveBeenCalledTimes(1);
    const [messages] = (llm.stream as ReturnType<typeof vi.fn>).mock.calls[0];
    const conversationText: string = messages[1].content;

    expect(conversationText).toContain('First message');
    expect(conversationText).toContain('Second message');
  });
});
