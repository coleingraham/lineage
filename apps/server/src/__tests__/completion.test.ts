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
) {
  const res = await jsonReq(app, `/trees/${treeId}/nodes`, {
    type: 'human',
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

describe('completion routes', () => {
  let repo: NodeRepository;
  let llm: LLMProvider;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    repo = new InMemoryRepository();
    llm = makeMockLLM(['Hello', ', ', 'world!']);
    app = createApp(repo, llm);
  });

  it('streams SSE delta events and a done event', async () => {
    const tree = await createTree(app);
    const node = await createNode(app, tree.treeId, tree.rootNodeId, 'Hi there');

    const res = await jsonReq(app, `/trees/${tree.treeId}/nodes/${node.nodeId}/complete`, {
      nodeId: node.nodeId,
      maxTokens: 100,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');

    const events = await readSSEEvents(res);

    const deltas = events.filter((e) => e.event === 'delta');
    expect(deltas).toHaveLength(3);
    expect(JSON.parse(deltas[0].data)).toEqual({ content: 'Hello' });
    expect(JSON.parse(deltas[1].data)).toEqual({ content: ', ' });
    expect(JSON.parse(deltas[2].data)).toEqual({ content: 'world!' });

    const doneEvents = events.filter((e) => e.event === 'done');
    expect(doneEvents).toHaveLength(1);
    const doneData = JSON.parse(doneEvents[0].data);
    expect(doneData.nodeId).toBeDefined();
  });

  it('writes an ai node to the repository on completion', async () => {
    const tree = await createTree(app);
    const node = await createNode(app, tree.treeId, tree.rootNodeId, 'Hi there');

    const res = await jsonReq(app, `/trees/${tree.treeId}/nodes/${node.nodeId}/complete`, {
      nodeId: node.nodeId,
      maxTokens: 100,
    });

    const events = await readSSEEvents(res);
    const doneData = JSON.parse(events.find((e) => e.event === 'done')!.data);

    const aiNode = await repo.getNode(doneData.nodeId);
    expect(aiNode.type).toBe('ai');
    expect(aiNode.content).toBe('Hello, world!');
    expect(aiNode.parentId).toBe(node.nodeId);
    expect(aiNode.treeId).toBe(tree.treeId);
  });

  it('passes correct messages to the LLM provider', async () => {
    const tree = await createTree(app);
    const node = await createNode(app, tree.treeId, tree.rootNodeId, 'What is 2+2?');

    await jsonReq(app, `/trees/${tree.treeId}/nodes/${node.nodeId}/complete`, {
      nodeId: node.nodeId,
      maxTokens: 200,
      temperature: 0.5,
    });

    expect(llm.stream).toHaveBeenCalledWith([{ role: 'human', content: 'What is 2+2?' }], {
      maxTokens: 200,
      temperature: 0.5,
    });
  });

  it('omits temperature when not provided', async () => {
    const tree = await createTree(app);
    const node = await createNode(app, tree.treeId, tree.rootNodeId, 'Hello');

    await jsonReq(app, `/trees/${tree.treeId}/nodes/${node.nodeId}/complete`, {
      nodeId: node.nodeId,
      maxTokens: 100,
    });

    expect(llm.stream).toHaveBeenCalledWith([{ role: 'human', content: 'Hello' }], {
      maxTokens: 100,
    });
  });

  it('returns 404 for non-existent tree', async () => {
    const res = await jsonReq(app, '/trees/nonexistent/nodes/some-node/complete', {
      nodeId: 'some-node',
      maxTokens: 100,
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent node', async () => {
    const tree = await createTree(app);

    const res = await jsonReq(app, `/trees/${tree.treeId}/nodes/nonexistent/complete`, {
      nodeId: 'nonexistent',
      maxTokens: 100,
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when node belongs to different tree', async () => {
    const tree1 = await createTree(app, 'Tree 1');
    const tree2 = await createTree(app, 'Tree 2');
    const node = await createNode(app, tree1.treeId, tree1.rootNodeId, 'Hi');

    const res = await jsonReq(app, `/trees/${tree2.treeId}/nodes/${node.nodeId}/complete`, {
      nodeId: node.nodeId,
      maxTokens: 100,
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid body', async () => {
    const tree = await createTree(app);

    const res = await jsonReq(app, `/trees/${tree.treeId}/nodes/${tree.rootNodeId}/complete`, {
      nodeId: tree.rootNodeId,
    });
    expect(res.status).toBe(400);
  });
});
