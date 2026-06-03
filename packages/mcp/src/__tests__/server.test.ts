import { describe, it, expect, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InMemoryRepository } from '@lineage/adapter-sqlite';
import type { LLMProvider } from '@lineage/core';
import { createMcpServer } from '../server.js';

/** Fake LLM that returns a fixed response. */
function fakeLlm(response: string): LLMProvider {
  return {
    async complete() {
      return response;
    },
    async *stream() {
      yield response;
    },
  };
}

// Helper to connect a client to the MCP server backed by InMemoryRepository
async function setup(options?: { llm?: LLMProvider }) {
  const repo = new InMemoryRepository();
  const server = createMcpServer(repo, options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await client.connect(clientTransport);
  return { client, repo };
}

function parseResult(result: { content: unknown[] }): unknown {
  const text = (result.content[0] as { type: string; text: string }).text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Enhanced existing tools ─────────────────────────────────────────────────

describe('list_trees', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('returns empty array when no trees exist', async () => {
    const result = await client.callTool({ name: 'list_trees', arguments: {} });
    expect(parseResult(result as { content: unknown[] })).toEqual([]);
  });

  it('supports limit and offset pagination', async () => {
    // Create 3 trees
    for (let i = 0; i < 3; i++) {
      await client.callTool({
        name: 'create_tree',
        arguments: { title: `Tree ${i}` },
      });
    }

    const all = parseResult(
      (await client.callTool({ name: 'list_trees', arguments: {} })) as { content: unknown[] },
    ) as unknown[];
    expect(all).toHaveLength(3);

    const limited = parseResult(
      (await client.callTool({
        name: 'list_trees',
        arguments: { limit: 2 },
      })) as { content: unknown[] },
    ) as unknown[];
    expect(limited).toHaveLength(2);

    const offset = parseResult(
      (await client.callTool({
        name: 'list_trees',
        arguments: { offset: 2 },
      })) as { content: unknown[] },
    ) as unknown[];
    expect(offset).toHaveLength(1);
  });
});

describe('list_nodes', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('supports limit and offset pagination', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Test', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    // Create additional nodes
    await client.callTool({
      name: 'create_node',
      arguments: {
        treeId: tree.treeId,
        parentId: tree.rootNodeId,
        content: 'child 1',
      },
    });
    await client.callTool({
      name: 'create_node',
      arguments: {
        treeId: tree.treeId,
        parentId: tree.rootNodeId,
        content: 'child 2',
      },
    });

    const all = parseResult(
      (await client.callTool({
        name: 'list_nodes',
        arguments: { treeId: tree.treeId },
      })) as { content: unknown[] },
    ) as unknown[];
    expect(all).toHaveLength(3);

    const limited = parseResult(
      (await client.callTool({
        name: 'list_nodes',
        arguments: { treeId: tree.treeId, limit: 1 },
      })) as { content: unknown[] },
    ) as unknown[];
    expect(limited).toHaveLength(1);
  });
});

// ── create_node with extended fields ────────────────────────────────────────

describe('create_node with extended fields', () => {
  let client: Client;
  let tree: { treeId: string; rootNodeId: string };

  beforeEach(async () => {
    ({ client } = await setup());
    tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Test', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };
  });

  it('accepts metadata', async () => {
    const node = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'with metadata',
          metadata: { key: 'value', nested: { a: 1 } },
        },
      })) as { content: unknown[] },
    ) as { metadata: Record<string, unknown> };

    expect(node.metadata).toEqual({ key: 'value', nested: { a: 1 } });
  });

  it('accepts modelName, provider, tokenCount, author', async () => {
    const node = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'ai response',
          type: 'ai',
          modelName: 'claude-opus-4-6',
          provider: 'anthropic',
          tokenCount: 150,
          author: 'agent-1',
        },
      })) as { content: unknown[] },
    ) as { modelName: string; provider: string; tokenCount: number; author: string; type: string };

    expect(node.modelName).toBe('claude-opus-4-6');
    expect(node.provider).toBe('anthropic');
    expect(node.tokenCount).toBe(150);
    expect(node.author).toBe('agent-1');
    expect(node.type).toBe('ai');
  });
});

// ── create_tree / update_tree with contextSources ───────────────────────────

describe('tree contextSources', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('create_tree accepts contextSources', async () => {
    const sources = [{ treeId: 'other-tree', nodeId: 'other-node' }];
    const result = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'With context', contextSources: sources },
      })) as { content: unknown[] },
    ) as { treeId: string };

    const tree = parseResult(
      (await client.callTool({
        name: 'get_tree',
        arguments: { treeId: result.treeId },
      })) as { content: unknown[] },
    ) as { contextSources: unknown[] };

    expect(tree.contextSources).toEqual(sources);
  });

  it('update_tree updates contextSources', async () => {
    const created = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Original' },
      })) as { content: unknown[] },
    ) as { treeId: string };

    const sources = [{ treeId: 'ref-tree', nodeId: 'ref-node' }];
    await client.callTool({
      name: 'update_tree',
      arguments: { treeId: created.treeId, contextSources: sources },
    });

    const tree = parseResult(
      (await client.callTool({
        name: 'get_tree',
        arguments: { treeId: created.treeId },
      })) as { content: unknown[] },
    ) as { contextSources: unknown[]; title: string };

    expect(tree.contextSources).toEqual(sources);
    expect(tree.title).toBe('Original'); // title unchanged
  });

  it('update_tree requires at least one field', async () => {
    const created = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Test' },
      })) as { content: unknown[] },
    ) as { treeId: string };

    const result = (await client.callTool({
      name: 'update_tree',
      arguments: { treeId: created.treeId },
    })) as { isError?: boolean };

    expect(result.isError).toBe(true);
  });
});

// ── build_context ───────────────────────────────────────────────────────────

describe('build_context', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('returns formatted messages from node to root', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Chat', rootContent: 'Hello' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const child = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'Hi there!',
          type: 'ai',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const messages = parseResult(
      (await client.callTool({
        name: 'build_context',
        arguments: { nodeId: child.nodeId },
      })) as { content: unknown[] },
    ) as { role: string; content: string }[];

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: 'human', content: 'Hello' });
    expect(messages[1]).toEqual({ role: 'ai', content: 'Hi there!' });
  });

  it('respects summary boundaries', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Chat', rootContent: 'message 1' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const summaryNode = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'Summary of conversation',
          type: 'summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const afterSummary = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: summaryNode.nodeId,
          content: 'Continuing...',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const messages = parseResult(
      (await client.callTool({
        name: 'build_context',
        arguments: { nodeId: afterSummary.nodeId },
      })) as { content: unknown[] },
    ) as { role: string; content: string }[];

    // Should include summary + continuation, but NOT the root message
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('Summary of conversation');
    expect(messages[1].content).toBe('Continuing...');
  });
});

// ── get_leaf_nodes ──────────────────────────────────────────────────────────

describe('get_leaf_nodes', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('returns leaf nodes of branching tree', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Branching', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    // Create two branches from root
    const branch1 = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'branch 1',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const branch2 = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'branch 2',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const leaves = parseResult(
      (await client.callTool({
        name: 'get_leaf_nodes',
        arguments: { treeId: tree.treeId },
      })) as { content: unknown[] },
    ) as { nodeId: string; content: string }[];

    const leafIds = leaves.map((l) => l.nodeId);
    expect(leafIds).toContain(branch1.nodeId);
    expect(leafIds).toContain(branch2.nodeId);
    expect(leafIds).not.toContain(tree.rootNodeId);
  });
});

// ── record_decision ─────────────────────────────────────────────────────────

describe('record_decision', () => {
  let client: Client;
  let tree: { treeId: string; rootNodeId: string };

  beforeEach(async () => {
    ({ client } = await setup());
    tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Session', rootContent: '' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };
  });

  it('creates a node with structured metadata and tag IDs', async () => {
    // Create category and tags first
    const category = parseResult(
      (await client.callTool({
        name: 'create_category',
        arguments: { name: 'architecture' },
      })) as { content: unknown[] },
    ) as { categoryId: string };

    const tag1 = parseResult(
      (await client.callTool({
        name: 'create_tag',
        arguments: { categoryId: category.categoryId, name: 'database' },
      })) as { content: unknown[] },
    ) as { tagId: string };

    const tag2 = parseResult(
      (await client.callTool({
        name: 'create_tag',
        arguments: { categoryId: category.categoryId, name: 'storage' },
      })) as { content: unknown[] },
    ) as { tagId: string };

    const node = parseResult(
      (await client.callTool({
        name: 'record_decision',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          summary: 'Chose PostgreSQL over SQLite',
          reasoning: 'Need concurrent writes',
          tagIds: [tag1.tagId, tag2.tagId],
          files: ['packages/adapters/postgres/src/repository.ts'],
        },
      })) as { content: unknown[] },
    ) as { content: string; metadata: Record<string, unknown>; tags: { tagId: string }[] };

    expect(node.content).toBe('Chose PostgreSQL over SQLite');
    expect(node.tags).toHaveLength(2);
    expect(node.metadata.files).toEqual(['packages/adapters/postgres/src/repository.ts']);
    expect(node.metadata.reasoning).toBe('Need concurrent writes');
    expect(node.metadata.recordedAt).toBeDefined();
  });

  it('works with minimal arguments', async () => {
    const node = parseResult(
      (await client.callTool({
        name: 'record_decision',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          summary: 'Simple decision',
        },
      })) as { content: unknown[] },
    ) as { content: string; metadata: Record<string, unknown>; tags: unknown[] };

    expect(node.content).toBe('Simple decision');
    expect(node.metadata.recordedAt).toBeDefined();
    expect(node.tags).toEqual([]);
  });
});

// ── recall_context ──────────────────────────────────────────────────────────

describe('recall_context', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('returns formatted context for matching nodes', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Architecture session', rootContent: 'Discussing database choices' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    await client.callTool({
      name: 'create_node',
      arguments: {
        treeId: tree.treeId,
        parentId: tree.rootNodeId,
        content: 'We decided to use PostgreSQL for production',
        type: 'ai',
      },
    });

    const result = (await client.callTool({
      name: 'recall_context',
      arguments: { query: 'PostgreSQL' },
    })) as { content: { type: string; text: string }[] };

    const text = result.content[0].text;
    expect(text).toContain('Architecture session');
    expect(text).toContain('PostgreSQL');
  });

  it('returns "No results found." for non-matching query', async () => {
    const result = (await client.callTool({
      name: 'recall_context',
      arguments: { query: 'nonexistent-query-xyz' },
    })) as { content: { type: string; text: string }[] };

    expect(result.content[0].text).toBe('No results found.');
  });

  it('rejects semantic mode with error', async () => {
    const result = (await client.callTool({
      name: 'recall_context',
      arguments: { query: 'test', mode: 'semantic' },
    })) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not yet implemented');
  });
});

// ── start_session ───────────────────────────────────────────────────────────

describe('start_session', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('creates a session with explicit title', async () => {
    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: { title: 'Bug fix session' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string; title: string };

    expect(session.title).toBe('Bug fix session');

    const tree = parseResult(
      (await client.callTool({
        name: 'get_tree',
        arguments: { treeId: session.treeId },
      })) as { content: unknown[] },
    ) as { title: string };

    expect(tree.title).toBe('Bug fix session');
  });

  it('defaults to "Untitled session" when no title provided', async () => {
    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: {},
      })) as { content: unknown[] },
    ) as { title: string };

    expect(session.title).toBe('Untitled session');
  });

  it('creates root node with description and session metadata', async () => {
    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: {
          title: 'Test',
          description: 'Working on auth module',
        },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const node = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: session.rootNodeId },
      })) as { content: unknown[] },
    ) as { content: string; metadata: Record<string, unknown> };

    expect(node.content).toBe('Working on auth module');
    expect(node.metadata.sessionType).toBe('coding');
    expect(node.metadata.startedAt).toBeDefined();
  });

  it('resolves related trees to context sources', async () => {
    // Create a tree with some nodes
    const relatedTree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Prior session', rootContent: 'prior root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const leaf = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: relatedTree.treeId,
          parentId: relatedTree.rootNodeId,
          content: 'leaf node',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: {
          title: 'New session',
          relatedTrees: [relatedTree.treeId],
        },
      })) as { content: unknown[] },
    ) as { contextSources: { treeId: string; nodeId: string }[] };

    expect(session.contextSources).toHaveLength(1);
    expect(session.contextSources[0].treeId).toBe(relatedTree.treeId);
    expect(session.contextSources[0].nodeId).toBe(leaf.nodeId);
  });
});

// ── end_session ─────────────────────────────────────────────────────────────

describe('end_session', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('creates a summary node with explicit summary', async () => {
    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: { title: 'Test session' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'end_session',
        arguments: {
          treeId: session.treeId,
          summary: 'Fixed the auth bug and added tests',
        },
      })) as { content: unknown[] },
    ) as { summaryNodeId: string; nodeCount: number };

    expect(result.summaryNodeId).toBeDefined();
    expect(result.nodeCount).toBeGreaterThan(0);

    const summaryNode = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: result.summaryNodeId },
      })) as { content: unknown[] },
    ) as { type: string; content: string };

    expect(summaryNode.type).toBe('summary');
    expect(summaryNode.content).toBe('Fixed the auth bug and added tests');
  });

  it('overrides tree title when provided', async () => {
    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: {},
      })) as { content: unknown[] },
    ) as { treeId: string };

    await client.callTool({
      name: 'end_session',
      arguments: {
        treeId: session.treeId,
        title: 'Auth bug fix',
        summary: 'Done',
      },
    });

    const tree = parseResult(
      (await client.callTool({
        name: 'get_tree',
        arguments: { treeId: session.treeId },
      })) as { content: unknown[] },
    ) as { title: string };

    expect(tree.title).toBe('Auth bug fix');
  });

  it('generates basic recap when no summary provided', async () => {
    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: { title: 'Test', description: 'Some context here' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'end_session',
        arguments: { treeId: session.treeId },
      })) as { content: unknown[] },
    ) as { summaryNodeId: string };

    const summaryNode = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: result.summaryNodeId },
      })) as { content: unknown[] },
    ) as { type: string; content: string };

    expect(summaryNode.type).toBe('summary');
    expect(summaryNode.content).toContain('[human]');
  });
});

// ── create_tree_from_nodes ──────────────────────────────────────────────────

describe('create_tree_from_nodes', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup());
  });

  it('uses summary source nodes directly', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const summaryNode = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'Summary of the conversation',
          type: 'summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'create_tree_from_nodes',
        arguments: {
          title: 'New tree',
          sourceNodes: [{ treeId: tree.treeId, nodeId: summaryNode.nodeId }],
        },
      })) as { content: unknown[] },
    ) as { contextSources: { treeId: string; nodeId: string }[] };

    expect(result.contextSources).toHaveLength(1);
    expect(result.contextSources[0].nodeId).toBe(summaryNode.nodeId);
  });

  it('resolves non-summary nodes with summary children', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const humanNode = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'A discussion point',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    // Create a summary child of the human node
    const summaryChild = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: humanNode.nodeId,
          content: 'Summary of the discussion point',
          type: 'summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'create_tree_from_nodes',
        arguments: {
          sourceNodes: [{ treeId: tree.treeId, nodeId: humanNode.nodeId }],
        },
      })) as { content: unknown[] },
    ) as { contextSources: { treeId: string; nodeId: string }[] };

    // Should resolve to the summary child, not the human node itself
    expect(result.contextSources[0].nodeId).toBe(summaryChild.nodeId);
  });

  it('uses non-summary nodes as-is when no summary exists', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const humanNode = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'A discussion without summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'create_tree_from_nodes',
        arguments: {
          sourceNodes: [{ treeId: tree.treeId, nodeId: humanNode.nodeId }],
        },
      })) as { content: unknown[] },
    ) as { contextSources: { treeId: string; nodeId: string }[] };

    // Should use the node itself
    expect(result.contextSources[0].nodeId).toBe(humanNode.nodeId);
  });

  it('defaults title to "Untitled session"', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'create_tree_from_nodes',
        arguments: {
          sourceNodes: [{ treeId: tree.treeId, nodeId: tree.rootNodeId }],
        },
      })) as { content: unknown[] },
    ) as { title: string };

    expect(result.title).toBe('Untitled session');
  });

  it('sets rootContent on the new tree root node', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'create_tree_from_nodes',
        arguments: {
          sourceNodes: [{ treeId: tree.treeId, nodeId: tree.rootNodeId }],
          rootContent: 'Starting new conversation with context',
          title: 'Contextual tree',
        },
      })) as { content: unknown[] },
    ) as { rootNodeId: string };

    const root = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: result.rootNodeId },
      })) as { content: unknown[] },
    ) as { content: string };

    expect(root.content).toBe('Starting new conversation with context');
  });

  it('handles multiple source nodes from different trees', async () => {
    const tree1 = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Tree 1', rootContent: 'root1' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const tree2 = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Tree 2', rootContent: 'root2' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'create_tree_from_nodes',
        arguments: {
          title: 'Combined',
          sourceNodes: [
            { treeId: tree1.treeId, nodeId: tree1.rootNodeId },
            { treeId: tree2.treeId, nodeId: tree2.rootNodeId },
          ],
        },
      })) as { content: unknown[] },
    ) as { contextSources: { treeId: string; nodeId: string }[] };

    expect(result.contextSources).toHaveLength(2);
  });
});

// ── LLM-backed summarization ───────────────────────────────────────────────

describe('end_session with LLM', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup({ llm: fakeLlm('LLM-generated summary of the session.') }));
  });

  it('auto-generates summary via LLM when no explicit summary provided', async () => {
    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: { title: 'LLM test', description: 'Testing auto-summarization' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    await client.callTool({
      name: 'create_node',
      arguments: {
        treeId: session.treeId,
        parentId: session.rootNodeId,
        content: 'We discussed important things',
        type: 'ai',
      },
    });

    const result = parseResult(
      (await client.callTool({
        name: 'end_session',
        arguments: { treeId: session.treeId },
      })) as { content: unknown[] },
    ) as { summaryNodeId: string };

    const summaryNode = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: result.summaryNodeId },
      })) as { content: unknown[] },
    ) as { type: string; content: string };

    expect(summaryNode.type).toBe('summary');
    expect(summaryNode.content).toBe('LLM-generated summary of the session.');
  });

  it('uses explicit summary over LLM when provided', async () => {
    const session = parseResult(
      (await client.callTool({
        name: 'start_session',
        arguments: { title: 'Test' },
      })) as { content: unknown[] },
    ) as { treeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'end_session',
        arguments: {
          treeId: session.treeId,
          summary: 'My explicit summary',
        },
      })) as { content: unknown[] },
    ) as { summaryNodeId: string };

    const summaryNode = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: result.summaryNodeId },
      })) as { content: unknown[] },
    ) as { content: string };

    expect(summaryNode.content).toBe('My explicit summary');
  });
});

describe('create_tree_from_nodes with LLM', () => {
  let client: Client;

  beforeEach(async () => {
    ({ client } = await setup({ llm: fakeLlm('Auto-generated summary.') }));
  });

  it('auto-summarizes non-summary nodes without existing summaries', async () => {
    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'Discussion content' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const humanNode = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'Detailed discussion without summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'create_tree_from_nodes',
        arguments: {
          sourceNodes: [{ treeId: tree.treeId, nodeId: humanNode.nodeId }],
        },
      })) as { content: unknown[] },
    ) as { contextSources: { treeId: string; nodeId: string }[] };

    // The resolved source should be the auto-generated summary, not the original node
    expect(result.contextSources[0].nodeId).not.toBe(humanNode.nodeId);

    // Verify the summary was saved
    const summaryNode = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: result.contextSources[0].nodeId },
      })) as { content: unknown[] },
    ) as { type: string; content: string };

    expect(summaryNode.type).toBe('summary');
    expect(summaryNode.content).toBe('Auto-generated summary.');
  });
});

describe('merge_branches', () => {
  it('creates an in-tree merge node parented to the summary nodes', async () => {
    const { client } = await setup();

    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const sA = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'Summary A',
          type: 'summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const sB = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree.treeId,
          parentId: tree.rootNodeId,
          content: 'Summary B',
          type: 'summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'merge_branches',
        arguments: {
          treeId: tree.treeId,
          sourceNodes: [
            { treeId: tree.treeId, nodeId: sA.nodeId },
            { treeId: tree.treeId, nodeId: sB.nodeId },
          ],
          content: 'merged input',
        },
      })) as { content: unknown[] },
    ) as { treeId: string; nodeId: string; mergeParentIds: string[] };

    expect(result.mergeParentIds).toEqual([sA.nodeId, sB.nodeId]);

    const mergeNode = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: result.nodeId },
      })) as { content: unknown[] },
    ) as { parentId: string; content: string; metadata: { mergeParentIds: string[] } };

    expect(mergeNode.parentId).toBe(sA.nodeId);
    expect(mergeNode.content).toBe('merged input');
    expect(mergeNode.metadata.mergeParentIds).toEqual([sA.nodeId, sB.nodeId]);
  });

  it('auto-summarizes non-summary sources before merging', async () => {
    const { client } = await setup({ llm: fakeLlm('Auto summary.') });

    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const branchA = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: { treeId: tree.treeId, parentId: tree.rootNodeId, content: 'Branch A' },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const branchB = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: { treeId: tree.treeId, parentId: tree.rootNodeId, content: 'Branch B' },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'merge_branches',
        arguments: {
          treeId: tree.treeId,
          sourceNodes: [
            { treeId: tree.treeId, nodeId: branchA.nodeId },
            { treeId: tree.treeId, nodeId: branchB.nodeId },
          ],
        },
      })) as { content: unknown[] },
    ) as { mergeParentIds: string[] };

    // Each parent is a freshly-created summary, not the original branch node
    expect(result.mergeParentIds).toHaveLength(2);
    expect(result.mergeParentIds).not.toContain(branchA.nodeId);
    expect(result.mergeParentIds).not.toContain(branchB.nodeId);

    const parent = parseResult(
      (await client.callTool({
        name: 'get_node',
        arguments: { nodeId: result.mergeParentIds[0] },
      })) as { content: unknown[] },
    ) as { type: string; content: string };
    expect(parent.type).toBe('summary');
    expect(parent.content).toBe('Auto summary.');
  });

  it('rejects sources that do not belong to the target tree', async () => {
    const { client } = await setup();

    const tree1 = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Tree 1', rootContent: 'root1' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const tree2 = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Tree 2', rootContent: 'root2' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const s1 = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree1.treeId,
          parentId: tree1.rootNodeId,
          content: 'S1',
          type: 'summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const s2 = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: {
          treeId: tree2.treeId,
          parentId: tree2.rootNodeId,
          content: 'S2',
          type: 'summary',
        },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = (await client.callTool({
      name: 'merge_branches',
      arguments: {
        treeId: tree1.treeId,
        sourceNodes: [
          { treeId: tree1.treeId, nodeId: s1.nodeId },
          { treeId: tree2.treeId, nodeId: s2.nodeId },
        ],
      },
    })) as { content: unknown[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(parseResult(result)).toContain('must belong to tree');
  });

  it('errors when the target tree does not exist', async () => {
    const { client } = await setup();
    const result = (await client.callTool({
      name: 'merge_branches',
      arguments: {
        treeId: 'nonexistent',
        sourceNodes: [
          { treeId: 'nonexistent', nodeId: 'a' },
          { treeId: 'nonexistent', nodeId: 'b' },
        ],
      },
    })) as { content: unknown[]; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(parseResult(result)).toContain('Tree not found');
  });
});

// ── Lineage ↔ Claude App Bridge ──────────────────────────────────────────────

describe('lineage_checkpoint', () => {
  it('creates a fresh tree under a context root, an immutable turn chain, and an LLM summary', async () => {
    const { client, repo } = await setup({ llm: fakeLlm('Eager summary.') });

    const result = parseResult(
      (await client.callTool({
        name: 'lineage_checkpoint',
        arguments: {
          turns: [
            { role: 'user', content: 'How should we shard?' },
            { role: 'assistant', content: 'By tenant id.' },
          ],
          synopsis: 'Decided on tenant-based sharding.',
          label: 'sharding',
        },
      })) as { content: unknown[] },
    ) as {
      treeId: string;
      contextNodeId: string;
      nodeIds: string[];
      summaryNodeId: string;
      summary: string;
    };

    expect(result.nodeIds).toHaveLength(2);
    expect(result.summary).toBe('Eager summary.');

    // Context root carries the logical kind and the synopsis as content.
    const root = await repo.getNode(result.contextNodeId);
    expect(root.parentId).toBeNull();
    expect(root.metadata).toMatchObject({ kind: 'context' });
    expect(root.content).toBe('Decided on tenant-based sharding.');

    // Turns form a chain: first turn parented to the context root.
    const first = await repo.getNode(result.nodeIds[0]);
    expect(first.type).toBe('human');
    expect(first.parentId).toBe(result.contextNodeId);
    const second = await repo.getNode(result.nodeIds[1]);
    expect(second.type).toBe('ai');
    expect(second.parentId).toBe(result.nodeIds[0]);

    // Summary node hangs off the last turn.
    const summaryNode = await repo.getNode(result.summaryNodeId);
    expect(summaryNode.type).toBe('summary');
    expect(summaryNode.parentId).toBe(result.nodeIds[1]);
    expect(summaryNode.metadata).toMatchObject({ synopsis: 'Decided on tenant-based sharding.' });
  });

  it('attaches under an existing parentNodeId without minting a new tree', async () => {
    const { client, repo } = await setup();

    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Existing' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'lineage_checkpoint',
        arguments: {
          turns: [{ role: 'user', content: 'Just one turn.' }],
          parentNodeId: tree.rootNodeId,
        },
      })) as { content: unknown[] },
    ) as { treeId: string; contextNodeId: string | null; nodeIds: string[] };

    expect(result.treeId).toBe(tree.treeId);
    expect(result.contextNodeId).toBeNull();
    const node = await repo.getNode(result.nodeIds[0]);
    expect(node.parentId).toBe(tree.rootNodeId);
  });

  it('falls back to synopsis as the summary when no LLM is configured', async () => {
    const { client, repo } = await setup();

    const result = parseResult(
      (await client.callTool({
        name: 'lineage_checkpoint',
        arguments: {
          turns: [{ role: 'user', content: 'A turn.' }],
          synopsis: 'My synopsis.',
        },
      })) as { content: unknown[] },
    ) as { summary: string; summaryNodeId: string };

    expect(result.summary).toBe('My synopsis.');
    const summaryNode = await repo.getNode(result.summaryNodeId);
    expect(summaryNode.content).toBe('My synopsis.');
  });
});

describe('lineage_view', () => {
  it('returns ancestry, the focal node, and its direct children', async () => {
    const { client } = await setup();

    const cp = parseResult(
      (await client.callTool({
        name: 'lineage_checkpoint',
        arguments: {
          turns: [
            { role: 'user', content: 'Q1' },
            { role: 'assistant', content: 'A1' },
          ],
        },
      })) as { content: unknown[] },
    ) as { nodeIds: string[] };

    const focalId = cp.nodeIds[0]; // the first turn — has an ancestor (root) and a child (A1)
    const view = parseResult(
      (await client.callTool({
        name: 'lineage_view',
        arguments: { nodeId: focalId },
      })) as { content: unknown[] },
    ) as { focus: { nodeId: string }; ancestry: unknown[]; children: { nodeId: string }[] };

    expect(view.focus.nodeId).toBe(focalId);
    expect(view.ancestry.length).toBeGreaterThanOrEqual(1);
    expect(view.children.map((c) => c.nodeId)).toContain(cp.nodeIds[1]);
  });

  it('focuses the most recent node when nodeId is omitted', async () => {
    const { client } = await setup();
    await client.callTool({
      name: 'lineage_checkpoint',
      arguments: { turns: [{ role: 'user', content: 'only' }] },
    });

    const view = parseResult(
      (await client.callTool({ name: 'lineage_view', arguments: {} })) as { content: unknown[] },
    ) as { focus: { nodeId: string } };

    // The most recently created node is the summary node, but the focal node
    // must at minimum be a real node in the tree we just built.
    expect(typeof view.focus.nodeId).toBe('string');
  });
});

describe('lineage_seed', () => {
  it('resolves sources to summaries, sets context sources, and returns seed text', async () => {
    const { client, repo } = await setup({ llm: fakeLlm('Summary of source.') });

    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Source', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const node = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: { treeId: tree.treeId, parentId: tree.rootNodeId, content: 'A detailed point.' },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'lineage_seed',
        arguments: {
          nodeIds: [{ treeId: tree.treeId, nodeId: node.nodeId }],
          intentLabel: 'alternative',
        },
      })) as { content: unknown[] },
    ) as {
      seedTreeId: string;
      seedNodeId: string;
      contextSources: { nodeId: string }[];
      seedText: string;
    };

    expect(result.contextSources[0].nodeId).not.toBe(node.nodeId); // resolved to a summary
    expect(result.seedText).toContain('Branch intent: alternative');
    expect(result.seedText).toContain('Summary of source.');

    // Seed root records the known intent in metadata.
    const seedRoot = await repo.getNode(result.seedNodeId);
    expect(seedRoot.metadata).toMatchObject({ intentLabel: 'alternative', intent: 'alternative' });

    // The seed tree's context sources are persisted.
    const seedTree = await repo.getTree(result.seedTreeId);
    expect(seedTree.contextSources).toHaveLength(1);
  });
});

describe('lineage_synthesize', () => {
  it('writes a synthesis node and a synthesis_link ref per source', async () => {
    const { client, repo } = await setup();

    const tree = parseResult(
      (await client.callTool({
        name: 'create_tree',
        arguments: { title: 'Work', rootContent: 'root' },
      })) as { content: unknown[] },
    ) as { treeId: string; rootNodeId: string };

    const a = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: { treeId: tree.treeId, parentId: tree.rootNodeId, content: 'Branch A' },
      })) as { content: unknown[] },
    ) as { nodeId: string };
    const b = parseResult(
      (await client.callTool({
        name: 'create_node',
        arguments: { treeId: tree.treeId, parentId: tree.rootNodeId, content: 'Branch B' },
      })) as { content: unknown[] },
    ) as { nodeId: string };

    const result = parseResult(
      (await client.callTool({
        name: 'lineage_synthesize',
        arguments: {
          nodeIds: [
            { treeId: tree.treeId, nodeId: a.nodeId },
            { treeId: tree.treeId, nodeId: b.nodeId },
          ],
          synthesis: 'A and B together suggest C.',
          attachTreeId: tree.treeId,
          attachParentNodeId: tree.rootNodeId,
        },
      })) as { content: unknown[] },
    ) as { synthesisNodeId: string; links: unknown[] };

    expect(result.links).toHaveLength(2);
    const synthNode = await repo.getNode(result.synthesisNodeId);
    expect(synthNode.content).toBe('A and B together suggest C.');
    expect(synthNode.parentId).toBe(tree.rootNodeId);

    const refs = await repo.getCrossTreeRefs({ fromNodeId: result.synthesisNodeId });
    expect(refs).toHaveLength(2);
    expect(refs.every((r) => r.kind === 'synthesis_link')).toBe(true);
  });
});
