import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type {
  NodeRepository,
  Node,
  Tree,
  LLMProvider,
  EmbeddingProvider,
  Message,
  Tag,
  TagCategory,
  ContextSource,
} from '@lineage/core';
import {
  buildContext,
  createNode,
  stripThinking,
  assembleContext,
  project,
  synthesisTransform,
  BRANCH_INTENTS,
  MERGE_PARENT_IDS_KEY,
} from '@lineage/core';

const contextSourceSchema = z.object({
  treeId: z.string(),
  nodeId: z.string(),
});

const SUMMARIZE_SYSTEM_PROMPT = `You are a precise summarizer. The user will provide a conversation thread. Your task is to produce a concise summary that captures:
- The key decisions and conclusions reached
- Important constraints or requirements mentioned
- Any open questions or unresolved points

Write the summary as a single, dense paragraph. Do not use bullet points or headings. Do not begin with "This conversation" or "The discussion" — start directly with the substance.`;

export interface McpServerOptions {
  llm?: LLMProvider;
  /**
   * Optional embedding provider. When present, capture-in (`lineage_checkpoint`)
   * eagerly embeds the segment summary. When absent (e.g. SQLite with no
   * embedding storage), embedding is skipped silently and any background
   * embedding job handles it later.
   */
  embedding?: EmbeddingProvider;
  /**
   * Base URL of the Lineage web app, used to build deep links returned by the
   * bridge tools (e.g. `http://localhost:5173`). Falls back to the
   * `LINEAGE_APP_URL` env var. When neither is set, deep links are omitted.
   */
  appUrl?: string;
}

/**
 * Summarize a conversation path using the configured LLM provider.
 * Walks from the target node to root (stopping at summary boundaries),
 * then sends the conversation to the LLM for summarization.
 */
async function llmSummarize(
  repo: NodeRepository,
  llm: LLMProvider,
  treeId: string,
  nodeId: string,
): Promise<string> {
  const allNodes = await repo.getNodes(treeId);
  const nodesById = new Map(allNodes.map((n) => [n.nodeId, n]));

  // Walk from target to root, stopping at summary boundaries
  const path: Node[] = [];
  let cur: Node | undefined = nodesById.get(nodeId);
  while (cur) {
    if (cur.isDeleted) break;
    path.push(cur);
    if (cur.type === 'summary' && cur.nodeId !== nodeId) break;
    cur = cur.parentId ? nodesById.get(cur.parentId) : undefined;
  }
  path.reverse();

  const filtered = path.filter((n) => !(n.parentId === null && n.content === ''));
  if (filtered.length === 0) return '';

  const conversationText = filtered
    .map((n) => {
      const role = n.type === 'human' ? 'Human' : 'Assistant';
      return `${role}: ${stripThinking(n.content)}`;
    })
    .join('\n\n');

  const messages: Message[] = [
    { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
    { role: 'human', content: conversationText },
  ];

  return llm.complete(messages, { maxTokens: 1024 });
}

/**
 * Resolve a list of source nodes into context sources that point at summary
 * nodes — the shared pin→summary logic behind both `create_tree_from_nodes`
 * (new tree) and `merge_branches` (in-tree merge node):
 *   1. a summary node is used as-is;
 *   2. a node with an existing (non-deleted) summary child reuses that child;
 *   3. otherwise, when an LLM is configured, the node's thread is summarized
 *      into a new summary child; without an LLM the node is used as-is.
 *
 * Returns a discriminated result so callers can surface a not-found error.
 */
async function resolveToSummaries(
  repo: NodeRepository,
  llm: LLMProvider | null,
  sourceNodes: ContextSource[],
): Promise<{ resolved: ContextSource[] } | { error: string }> {
  const resolved: ContextSource[] = [];

  for (const source of sourceNodes) {
    let node: Node;
    try {
      node = await repo.getNode(source.nodeId);
    } catch {
      return { error: `Source node not found: ${source.nodeId}` };
    }

    if (node.type === 'summary') {
      resolved.push({ treeId: source.treeId, nodeId: node.nodeId });
      continue;
    }

    const treeNodes = await repo.getNodes(node.treeId);
    const summaryChild = treeNodes.find(
      (n) => n.parentId === node.nodeId && n.type === 'summary' && !n.isDeleted,
    );
    if (summaryChild) {
      resolved.push({ treeId: source.treeId, nodeId: summaryChild.nodeId });
    } else if (llm) {
      const summaryText = await llmSummarize(repo, llm, node.treeId, node.nodeId);
      const newSummary = createNode({
        treeId: node.treeId,
        parentId: node.nodeId,
        type: 'summary',
        content: summaryText,
      });
      await repo.putNode(newSummary);
      resolved.push({ treeId: source.treeId, nodeId: newSummary.nodeId });
    } else {
      resolved.push({ treeId: source.treeId, nodeId: node.nodeId });
    }
  }

  return { resolved };
}

export function createMcpServer(repo: NodeRepository, options: McpServerOptions = {}): McpServer {
  const llm = options.llm ?? null;
  const embedding = options.embedding ?? null;
  const appUrl = (options.appUrl ?? process.env.LINEAGE_APP_URL)?.replace(/\/+$/, '');

  /** Build a deep link into the Lineage web app, or undefined when no base URL is configured. */
  const makeUrl = (treeId: string, nodeId: string): string | undefined =>
    appUrl
      ? `${appUrl}/?tree=${encodeURIComponent(treeId)}&node=${encodeURIComponent(nodeId)}`
      : undefined;

  const server = new McpServer({
    name: 'lineage',
    version: '0.1.0',
  });

  // ── Tree operations ──────────────────────────────────────────────────────

  server.tool(
    'list_trees',
    'List all conversation trees. Supports pagination via limit/offset.',
    {
      limit: z.number().int().positive().optional().describe('Maximum number of trees to return'),
      offset: z.number().int().nonnegative().optional().describe('Number of trees to skip'),
    },
    async ({ limit, offset }) => {
      let trees = await repo.listTrees();
      if (offset !== undefined) {
        trees = trees.slice(offset);
      }
      if (limit !== undefined) {
        trees = trees.slice(0, limit);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(trees, null, 2) }],
      };
    },
  );

  server.tool(
    'get_tree',
    'Get a conversation tree by ID',
    { treeId: z.string().describe('The tree ID') },
    async ({ treeId }) => {
      try {
        const tree = await repo.getTree(treeId);
        return { content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Tree not found: ${treeId}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_tree',
    'Create a new conversation tree with a root node',
    {
      title: z.string().describe('Title for the conversation'),
      rootContent: z.string().default('').describe('Content for the root node'),
      contextSources: z
        .array(contextSourceSchema)
        .optional()
        .describe('Context sources from other trees to inject as background context'),
    },
    async ({ title, rootContent, contextSources }) => {
      const treeId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      await repo.putTree({
        treeId,
        title,
        createdAt,
        rootNodeId,
        contextSources: contextSources ?? null,
      });
      await repo.putNode({
        nodeId: rootNodeId,
        treeId,
        parentId: null,
        type: 'human',
        content: rootContent,
        isDeleted: false,
        createdAt,
        modelName: null,
        provider: null,
        tokenCount: null,
        embeddingModel: null,
        metadata: null,
        author: null,
        intent: null,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ treeId, rootNodeId, title }, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    'update_tree',
    'Update a tree title and/or context sources',
    {
      treeId: z.string().describe('The tree ID'),
      title: z.string().optional().describe('New title'),
      contextSources: z
        .array(contextSourceSchema)
        .optional()
        .describe('New context sources (replaces existing)'),
    },
    async ({ treeId, title, contextSources }) => {
      if (title === undefined && contextSources === undefined) {
        return {
          content: [{ type: 'text', text: 'At least one of title or contextSources is required' }],
          isError: true,
        };
      }
      try {
        const tree = await repo.getTree(treeId);
        const updated = {
          ...tree,
          ...(title !== undefined && { title }),
          ...(contextSources !== undefined && { contextSources }),
        };
        await repo.putTree(updated);
        return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Tree not found: ${treeId}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_tree',
    'Delete a conversation tree and all its nodes',
    { treeId: z.string().describe('The tree ID') },
    async ({ treeId }) => {
      try {
        await repo.deleteTree(treeId);
        return { content: [{ type: 'text', text: `Deleted tree ${treeId}` }] };
      } catch {
        return { content: [{ type: 'text', text: `Tree not found: ${treeId}` }], isError: true };
      }
    },
  );

  // ── Node operations ──────────────────────────────────────────────────────

  server.tool(
    'list_nodes',
    'List all nodes in a conversation tree. Supports filtering and pagination.',
    {
      treeId: z.string().describe('The tree ID'),
      type: z.string().optional().describe('Filter by node type (human, ai, summary, etc.)'),
      limit: z.number().int().positive().optional().describe('Maximum number of nodes to return'),
      offset: z.number().int().nonnegative().optional().describe('Number of nodes to skip'),
    },
    async ({ treeId, type, limit, offset }) => {
      try {
        let nodes = await repo.getNodes(treeId);
        if (type) {
          nodes = nodes.filter((n) => n.type === type);
        }
        if (offset !== undefined) {
          nodes = nodes.slice(offset);
        }
        if (limit !== undefined) {
          nodes = nodes.slice(0, limit);
        }
        return { content: [{ type: 'text', text: JSON.stringify(nodes, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Tree not found: ${treeId}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_node',
    'Get a specific node by ID',
    { nodeId: z.string().describe('The node ID') },
    async ({ nodeId }) => {
      try {
        const node = await repo.getNode(nodeId);
        return { content: [{ type: 'text', text: JSON.stringify(node, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }], isError: true };
      }
    },
  );

  server.tool(
    'create_node',
    'Create a new node in a conversation tree',
    {
      treeId: z.string().describe('The tree ID'),
      parentId: z.string().describe('Parent node ID'),
      content: z.string().describe('Node content'),
      type: z
        .string()
        .default('human')
        .describe('Node type (human, ai, system, summary, tool_call, tool_result)'),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Arbitrary key-value data (agentic memory, tool params, tags, etc.)'),
      modelName: z.string().optional().describe('LLM model name that generated this content'),
      provider: z.string().optional().describe('LLM provider name'),
      tokenCount: z.number().int().optional().describe('Token count for context budgeting'),
      author: z.string().optional().describe('Author identifier (userId, agent name, etc.)'),
    },
    async ({
      treeId,
      parentId,
      content: nodeContent,
      type: nodeType,
      metadata,
      modelName,
      provider,
      tokenCount,
      author,
    }) => {
      try {
        await repo.getTree(treeId);
        await repo.getNode(parentId);
      } catch {
        return {
          content: [{ type: 'text', text: 'Tree or parent node not found' }],
          isError: true,
        };
      }

      const node = createNode({
        treeId,
        parentId,
        type: nodeType,
        content: nodeContent,
        metadata: metadata ?? null,
        modelName: modelName ?? null,
        provider: provider ?? null,
        tokenCount: tokenCount ?? null,
        author: author ?? null,
      });
      await repo.putNode(node);

      return {
        content: [{ type: 'text', text: JSON.stringify(node, null, 2) }],
      };
    },
  );

  server.tool(
    'update_node',
    'Update an existing node content',
    {
      nodeId: z.string().describe('The node ID'),
      content: z.string().describe('New content'),
    },
    async ({ nodeId, content: newContent }) => {
      try {
        const node = await repo.getNode(nodeId);
        const updated = { ...node, content: newContent };
        await repo.putNode(updated);
        return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }], isError: true };
      }
    },
  );

  server.tool(
    'delete_node',
    'Soft-delete a node (marks as deleted but preserves data)',
    { nodeId: z.string().describe('The node ID') },
    async ({ nodeId }) => {
      try {
        await repo.softDeleteNode(nodeId);
        return { content: [{ type: 'text', text: `Soft-deleted node ${nodeId}` }] };
      } catch {
        return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }], isError: true };
      }
    },
  );

  // ── Navigation ───────────────────────────────────────────────────────────

  server.tool(
    'get_path_to_root',
    'Get the full path from a node up to the tree root. Useful for understanding context and backtracking.',
    { nodeId: z.string().describe('The starting node ID') },
    async ({ nodeId }) => {
      try {
        const startNode = await repo.getNode(nodeId);
        const allNodes = await repo.getNodes(startNode.treeId);
        const nodeMap = new Map(allNodes.map((n) => [n.nodeId, n]));

        const path = [];
        let current: typeof startNode | undefined = startNode;
        while (current) {
          path.unshift(current);
          current = current.parentId ? nodeMap.get(current.parentId) : undefined;
        }

        return { content: [{ type: 'text', text: JSON.stringify(path, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_children',
    'Get direct children of a node. Useful for exploring branches.',
    { nodeId: z.string().describe('The parent node ID') },
    async ({ nodeId }) => {
      try {
        const node = await repo.getNode(nodeId);
        const allNodes = await repo.getNodes(node.treeId);
        const children = allNodes.filter((n) => n.parentId === nodeId && !n.isDeleted);
        return { content: [{ type: 'text', text: JSON.stringify(children, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_siblings',
    'Get sibling nodes (nodes sharing the same parent). Useful for seeing alternatives.',
    { nodeId: z.string().describe('The node ID') },
    async ({ nodeId }) => {
      try {
        const node = await repo.getNode(nodeId);
        if (!node.parentId) {
          return { content: [{ type: 'text', text: '[]' }] };
        }
        const allNodes = await repo.getNodes(node.treeId);
        const siblings = allNodes.filter(
          (n) => n.parentId === node.parentId && n.nodeId !== nodeId && !n.isDeleted,
        );
        return { content: [{ type: 'text', text: JSON.stringify(siblings, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_leaf_nodes',
    'Get the leaf (tip) node of each branch in a tree. Useful for surveying active conversation threads.',
    { treeId: z.string().describe('The tree ID') },
    async ({ treeId }) => {
      try {
        const allNodes = await repo.getNodes(treeId);
        const parentIds = new Set(allNodes.map((n) => n.parentId).filter(Boolean));
        const leaves = allNodes.filter((n) => !parentIds.has(n.nodeId) && !n.isDeleted);
        return { content: [{ type: 'text', text: JSON.stringify(leaves, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Tree not found: ${treeId}` }], isError: true };
      }
    },
  );

  // ── Context ─────────────────────────────────────────────────────────────

  server.tool(
    'build_context',
    'Build the ordered message context from a node back to the tree root, respecting summary boundaries and token budgets. Returns the exact context an LLM would receive.',
    {
      nodeId: z.string().describe('The target node ID'),
      maxContextTokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum total tokens allowed in the context window'),
    },
    async ({ nodeId, maxContextTokens }) => {
      try {
        const node = await repo.getNode(nodeId);
        const allNodes = await repo.getNodes(node.treeId);
        const messages = buildContext(allNodes, nodeId, {
          ...(maxContextTokens !== undefined && { maxContextTokens }),
        });
        return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] };
      } catch {
        return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }], isError: true };
      }
    },
  );

  // ── Search ───────────────────────────────────────────────────────────────

  server.tool(
    'search',
    'Search across tree titles and node content',
    {
      query: z.string().describe('Search query'),
      nodeTypes: z
        .array(z.string())
        .optional()
        .describe('Filter by node types (e.g. ["human", "ai"])'),
      treeId: z.string().optional().describe('Limit search to a specific tree'),
    },
    async ({ query, nodeTypes, treeId }) => {
      const [trees, nodes] = await Promise.all([
        repo.searchTrees(query),
        repo.searchNodes({ query, nodeTypes, treeId }),
      ]);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ trees, nodes }, null, 2),
          },
        ],
      };
    },
  );

  // ── High-level workflow tools ───────────────────────────────────────────

  server.tool(
    'record_decision',
    'Record a decision with structured metadata. Creates a node and applies tags by ID.',
    {
      treeId: z.string().describe('The session tree ID'),
      parentId: z.string().describe('Parent node ID (typically the current leaf)'),
      summary: z.string().describe('The decision text'),
      reasoning: z.string().optional().describe('Why this decision was made'),
      tagIds: z
        .array(z.string())
        .optional()
        .describe('Tag IDs to apply to this decision (use list_tags to find IDs)'),
      files: z.array(z.string()).optional().describe('Related file paths'),
    },
    async ({ treeId, parentId, summary, reasoning, tagIds, files }) => {
      try {
        await repo.getTree(treeId);
        await repo.getNode(parentId);
      } catch {
        return {
          content: [{ type: 'text', text: 'Tree or parent node not found' }],
          isError: true,
        };
      }

      const metadata: Record<string, unknown> = { recordedAt: new Date().toISOString() };
      if (files !== undefined) metadata.files = files;
      if (reasoning !== undefined) metadata.reasoning = reasoning;

      const node = createNode({
        treeId,
        parentId,
        type: 'human',
        content: summary,
        metadata,
      });
      await repo.putNode(node);

      let appliedTags: Tag[] = [];
      if (tagIds && tagIds.length > 0) {
        await repo.tagNode(node.nodeId, tagIds);
        appliedTags = await repo.getNodeTags(node.nodeId);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ ...node, tags: appliedTags }, null, 2) }],
      };
    },
  );

  server.tool(
    'recall_context',
    'Search for past conversations and return assembled context ready for consumption. Wraps search + context building into a single retrieval tool.',
    {
      query: z.string().describe('Natural language search query'),
      maxTokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Total token budget for returned context'),
      nodeTypes: z
        .array(z.string())
        .optional()
        .describe('Filter by node types (e.g. ["human", "ai"])'),
      treeId: z.string().optional().describe('Limit search to a specific tree'),
      tagIds: z
        .array(z.string())
        .optional()
        .describe('Filter results to nodes that have ALL of these tags'),
      mode: z
        .enum(['text', 'semantic'])
        .default('text')
        .describe('Search mode: "text" (substring match) or "semantic" (embedding-based, future)'),
    },
    async ({ query, maxTokens, nodeTypes, treeId, tagIds, mode }) => {
      if (mode === 'semantic') {
        return {
          content: [
            {
              type: 'text',
              text: 'Semantic search is not yet implemented. Use mode "text" instead.',
            },
          ],
          isError: true,
        };
      }

      let results = await repo.searchNodes({ query, nodeTypes, treeId });

      // Post-filter by tags if specified
      if (tagIds && tagIds.length > 0) {
        const taggedNodes = await repo.findNodesByTags(tagIds, { treeId });
        const taggedIds = new Set(taggedNodes.map((n) => n.nodeId));
        results = results.filter((r) => taggedIds.has(r.node.nodeId));
      }

      if (results.length === 0) {
        return {
          content: [{ type: 'text', text: 'No results found.' }],
        };
      }

      // Limit to top 5 results to avoid context explosion
      const topResults = results.slice(0, 5);
      const perResultBudget =
        maxTokens !== undefined ? Math.floor(maxTokens / topResults.length) : undefined;

      const sections: string[] = [];

      for (const result of topResults) {
        const allNodes = await repo.getNodes(result.node.treeId);
        const messages = buildContext(allNodes, result.node.nodeId, {
          ...(perResultBudget !== undefined && { maxContextTokens: perResultBudget }),
        });

        const formattedMessages = messages
          .map(
            (m) =>
              `  [${m.role}]: ${m.content.slice(0, 500)}${m.content.length > 500 ? '...' : ''}`,
          )
          .join('\n');

        sections.push(
          `--- Tree: "${result.treeTitle}" ---\n` +
            `Match (${result.node.type}): ${result.node.content.slice(0, 200)}${result.node.content.length > 200 ? '...' : ''}\n` +
            `Context:\n${formattedMessages}`,
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: sections.join('\n\n'),
          },
        ],
      };
    },
  );

  server.tool(
    'start_session',
    'Start a new coding session. Creates a tree optionally seeded with context from related past sessions.',
    {
      title: z
        .string()
        .optional()
        .describe('Session title (defaults to "Untitled session" — no auto-generation)'),
      description: z.string().optional().describe('Initial context about what this session is for'),
      relatedTrees: z
        .array(z.string())
        .optional()
        .describe('Tree IDs to pull context from (uses their leaf nodes as context sources)'),
    },
    async ({ title, description, relatedTrees }) => {
      const sessionTitle = title ?? 'Untitled session';
      const treeId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      // Resolve related trees to context sources by finding their leaf nodes
      let contextSources: { treeId: string; nodeId: string }[] | null = null;
      if (relatedTrees && relatedTrees.length > 0) {
        contextSources = [];
        for (const relatedTreeId of relatedTrees) {
          try {
            const nodes = await repo.getNodes(relatedTreeId);
            const parentIds = new Set(nodes.map((n) => n.parentId).filter(Boolean));
            const leaves = nodes.filter((n) => !parentIds.has(n.nodeId) && !n.isDeleted);
            // Use the most recent leaf
            if (leaves.length > 0) {
              const leaf = leaves[leaves.length - 1];
              contextSources.push({ treeId: relatedTreeId, nodeId: leaf.nodeId });
            }
          } catch {
            // Skip trees that don't exist
          }
        }
        if (contextSources.length === 0) contextSources = null;
      }

      await repo.putTree({ treeId, title: sessionTitle, createdAt, rootNodeId, contextSources });

      const metadata: Record<string, unknown> = {
        sessionType: 'coding',
        startedAt: createdAt,
      };

      await repo.putNode(
        createNode({
          nodeId: rootNodeId,
          treeId,
          parentId: null,
          type: 'human',
          content: description ?? '',
          metadata,
        }),
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { treeId, rootNodeId, title: sessionTitle, contextSources },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'end_session',
    'End a coding session. Optionally updates the title and creates a summary node for future reference. ' +
      'When an LLM is configured and no explicit summary is provided, generates one automatically.',
    {
      treeId: z.string().describe('The session tree ID'),
      title: z.string().optional().describe('Override the tree title'),
      summary: z.string().optional().describe('Agent-provided summary of what was accomplished'),
    },
    async ({ treeId, title, summary }) => {
      let tree;
      try {
        tree = await repo.getTree(treeId);
      } catch {
        return { content: [{ type: 'text', text: `Tree not found: ${treeId}` }], isError: true };
      }

      // Update title if provided
      if (title !== undefined) {
        await repo.putTree({ ...tree, title });
        tree = { ...tree, title };
      }

      const allNodes = await repo.getNodes(treeId);
      const activeNodes = allNodes.filter((n) => !n.isDeleted);

      // Find the leaf node to attach the summary to
      const parentIds = new Set(activeNodes.map((n) => n.parentId).filter(Boolean));
      const leaves = activeNodes.filter((n) => !parentIds.has(n.nodeId));
      const leafNode = leaves[leaves.length - 1] ?? activeNodes[activeNodes.length - 1];
      const leafNodeId = leafNode?.nodeId ?? tree.rootNodeId;

      let summaryContent: string;
      if (summary) {
        summaryContent = summary;
      } else if (llm) {
        // Auto-summarize using the configured LLM
        summaryContent = await llmSummarize(repo, llm, treeId, leafNodeId);
      } else {
        // Fallback: basic recap from node contents
        summaryContent = activeNodes
          .slice(0, 20)
          .map(
            (n) => `[${n.type}] ${n.content.slice(0, 100)}${n.content.length > 100 ? '...' : ''}`,
          )
          .join('\n');
      }

      const summaryNode = createNode({
        treeId,
        parentId: leafNodeId,
        type: 'summary',
        content: summaryContent,
      });
      await repo.putNode(summaryNode);
      const summaryNodeId = summaryNode.nodeId;

      // Calculate duration if the root has a startedAt metadata
      const rootNode = allNodes.find((n) => n.nodeId === tree.rootNodeId);
      const startedAt = rootNode?.metadata?.startedAt as string | undefined;
      const duration = startedAt
        ? `${Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)}s`
        : null;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                treeId,
                title: tree.title,
                summaryNodeId,
                nodeCount: activeNodes.length,
                duration,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'create_tree_from_nodes',
    'Create a new conversation tree seeded with context from selected nodes across multiple trees. ' +
      'Equivalent to the web app\'s "New conversation from context" pinned-nodes workflow. ' +
      'Summary nodes are used directly; non-summary nodes are checked for summary children; ' +
      'when an LLM is configured, non-summary nodes without existing summaries are auto-summarized; ' +
      'otherwise they are used as-is.',
    {
      title: z
        .string()
        .optional()
        .describe('Title for the new tree (defaults to "Untitled session")'),
      sourceNodes: z
        .array(contextSourceSchema)
        .min(1)
        .describe('Nodes to use as context sources (the agent equivalent of pinned nodes)'),
      rootContent: z.string().optional().describe('Content for the root node of the new tree'),
    },
    async ({ title, sourceNodes, rootContent }) => {
      const result = await resolveToSummaries(repo, llm, sourceNodes);
      if ('error' in result) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const resolvedSources = result.resolved;

      const treeId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const treeTitle = title ?? 'Untitled session';

      await repo.putTree({
        treeId,
        title: treeTitle,
        createdAt,
        rootNodeId,
        contextSources: resolvedSources,
      });

      await repo.putNode(
        createNode({
          nodeId: rootNodeId,
          treeId,
          parentId: null,
          type: 'human',
          content: rootContent ?? '',
        }),
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { treeId, rootNodeId, title: treeTitle, contextSources: resolvedSources },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'merge_branches',
    'Merge multiple branches WITHIN a single tree by creating a new merge node whose parents ' +
      "are the selected branches' summary nodes (a node with multiple incoming edges). " +
      'Like create_tree_from_nodes, non-summary sources are resolved to summaries (reusing an ' +
      'existing summary child or auto-summarizing when an LLM is configured), but instead of a ' +
      'new tree it creates an empty input node in the given tree. All resolved summaries must ' +
      'belong to the target tree.',
    {
      treeId: z.string().describe('The tree to create the merge node in'),
      sourceNodes: z
        .array(contextSourceSchema)
        .min(2)
        .describe('The branch nodes to merge (the agent equivalent of pinned nodes)'),
      content: z
        .string()
        .optional()
        .describe('Initial content for the merge node (defaults to empty)'),
    },
    async ({ treeId, sourceNodes, content }) => {
      try {
        await repo.getTree(treeId);
      } catch {
        return { content: [{ type: 'text', text: `Tree not found: ${treeId}` }], isError: true };
      }

      const result = await resolveToSummaries(repo, llm, sourceNodes);
      if ('error' in result) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const resolvedSources = result.resolved;

      // Merge parents must live in the target tree — the context walk is
      // single-tree, so a cross-tree summary could never be resolved as a parent.
      const foreign = resolvedSources.filter((s) => s.treeId !== treeId);
      if (foreign.length > 0) {
        return {
          content: [
            {
              type: 'text',
              text:
                `All source nodes must belong to tree ${treeId} to merge in-tree; ` +
                `found ${foreign.length} from other tree(s). Use create_tree_from_nodes for cross-tree context.`,
            },
          ],
          isError: true,
        };
      }

      const summaryIds = resolvedSources.map((s) => s.nodeId);
      const mergeNode = createNode({
        treeId,
        parentId: summaryIds[0],
        type: 'human',
        content: content ?? '',
        metadata: { [MERGE_PARENT_IDS_KEY]: summaryIds },
      });
      await repo.putNode(mergeNode);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { treeId, nodeId: mergeNode.nodeId, mergeParentIds: summaryIds },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Tag category tools ───────────────────────────────────────────────

  server.tool(
    'create_category',
    'Create a tag category for organizing tags',
    {
      name: z.string().describe('Category name (must be unique)'),
      description: z.string().default('').describe('Category description'),
    },
    async ({ name, description }) => {
      const category: TagCategory = {
        categoryId: crypto.randomUUID(),
        name,
        description,
        createdAt: new Date().toISOString(),
      };
      try {
        await repo.createCategory(category);
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to create category: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(category, null, 2) }] };
    },
  );

  server.tool('list_categories', 'List all tag categories', {}, async () => {
    const categories = await repo.listCategories();
    return { content: [{ type: 'text', text: JSON.stringify(categories, null, 2) }] };
  });

  server.tool(
    'update_category',
    'Update a tag category name and/or description',
    {
      categoryId: z.string().describe('The category ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
    },
    async ({ categoryId, name, description }) => {
      if (name === undefined && description === undefined) {
        return {
          content: [{ type: 'text', text: 'At least one of name or description is required' }],
          isError: true,
        };
      }
      try {
        await repo.updateCategory(categoryId, {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
        });
        const updated = await repo.getCategory(categoryId);
        return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'delete_category',
    'Delete an empty tag category. Fails if the category still has tags.',
    { categoryId: z.string().describe('The category ID') },
    async ({ categoryId }) => {
      try {
        await repo.deleteCategory(categoryId);
        return { content: [{ type: 'text', text: `Deleted category ${categoryId}` }] };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Tag tools ───────────────────────────────────────────────────────────

  server.tool(
    'create_tag',
    'Create a tag within a category',
    {
      categoryId: z.string().describe('The parent category ID'),
      name: z.string().describe('Tag name (must be unique within the category)'),
      description: z.string().default('').describe('Tag description'),
    },
    async ({ categoryId, name, description }) => {
      const tag: Tag = {
        tagId: crypto.randomUUID(),
        categoryId,
        name,
        description,
        createdAt: new Date().toISOString(),
      };
      try {
        await repo.createTag(tag);
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to create tag: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(tag, null, 2) }] };
    },
  );

  server.tool(
    'list_tags',
    'List tags, optionally filtered by category',
    {
      categoryId: z.string().optional().describe('Filter by category ID'),
    },
    async ({ categoryId }) => {
      const tags = await repo.listTags(categoryId);
      return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
    },
  );

  server.tool(
    'update_tag',
    'Update a tag name and/or description',
    {
      tagId: z.string().describe('The tag ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
    },
    async ({ tagId, name, description }) => {
      if (name === undefined && description === undefined) {
        return {
          content: [{ type: 'text', text: 'At least one of name or description is required' }],
          isError: true,
        };
      }
      try {
        await repo.updateTag(tagId, {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
        });
        const updated = await repo.getTag(tagId);
        return { content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }] };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'delete_tag',
    'Delete a tag and remove all its associations from nodes and trees',
    { tagId: z.string().describe('The tag ID') },
    async ({ tagId }) => {
      try {
        await repo.deleteTag(tagId);
        return { content: [{ type: 'text', text: `Deleted tag ${tagId}` }] };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  // ── Tagging operation tools ─────────────────────────────────────────────

  server.tool(
    'tag_node',
    'Apply tags to a node by tag IDs',
    {
      nodeId: z.string().describe('The node ID'),
      tagIds: z.array(z.string()).min(1).describe('Tag IDs to apply'),
    },
    async ({ nodeId, tagIds }) => {
      try {
        await repo.tagNode(nodeId, tagIds);
        const tags = await repo.getNodeTags(nodeId);
        return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'untag_node',
    'Remove tags from a node by tag IDs',
    {
      nodeId: z.string().describe('The node ID'),
      tagIds: z.array(z.string()).min(1).describe('Tag IDs to remove'),
    },
    async ({ nodeId, tagIds }) => {
      await repo.untagNode(nodeId, tagIds);
      const tags = await repo.getNodeTags(nodeId);
      return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
    },
  );

  server.tool(
    'get_node_tags',
    'Get all tags applied to a node',
    { nodeId: z.string().describe('The node ID') },
    async ({ nodeId }) => {
      const tags = await repo.getNodeTags(nodeId);
      return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
    },
  );

  server.tool(
    'tag_tree',
    'Apply tags to a tree by tag IDs',
    {
      treeId: z.string().describe('The tree ID'),
      tagIds: z.array(z.string()).min(1).describe('Tag IDs to apply'),
    },
    async ({ treeId, tagIds }) => {
      try {
        await repo.tagTree(treeId, tagIds);
        const tags = await repo.getTreeTags(treeId);
        return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'untag_tree',
    'Remove tags from a tree by tag IDs',
    {
      treeId: z.string().describe('The tree ID'),
      tagIds: z.array(z.string()).min(1).describe('Tag IDs to remove'),
    },
    async ({ treeId, tagIds }) => {
      await repo.untagTree(treeId, tagIds);
      const tags = await repo.getTreeTags(treeId);
      return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
    },
  );

  server.tool(
    'get_tree_tags',
    'Get all tags applied to a tree',
    { treeId: z.string().describe('The tree ID') },
    async ({ treeId }) => {
      const tags = await repo.getTreeTags(treeId);
      return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] };
    },
  );

  server.tool(
    'find_by_tags',
    'Find nodes and/or trees by tags. By default requires ALL tags to match; set matchAll=false for ANY (OR) matching.',
    {
      tagIds: z.array(z.string()).min(1).describe('Tag IDs to filter by'),
      scope: z
        .enum(['nodes', 'trees', 'all'])
        .default('all')
        .describe('What to search: nodes, trees, or both'),
      treeId: z.string().optional().describe('Limit node search to a specific tree'),
      matchAll: z
        .boolean()
        .default(true)
        .describe(
          'When true (default), all tags must match (AND). When false, any tag can match (OR).',
        ),
    },
    async ({ tagIds, scope, treeId, matchAll }) => {
      const result: { nodes?: Node[]; trees?: Tree[] } = {};

      if (scope === 'nodes' || scope === 'all') {
        result.nodes = await repo.findNodesByTags(tagIds, { treeId, matchAll });
      }
      if (scope === 'trees' || scope === 'all') {
        result.trees = await repo.findTreesByTags(tagIds, { matchAll });
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── Lineage ↔ Claude App Bridge ─────────────────────────────────────────
  // Tools that give Lineage a presence inside the Claude app for long
  // conversations. The server never reads the app thread directly — Claude
  // extracts content and passes it in. See the bridge plan for the design.

  server.tool(
    'lineage_checkpoint',
    'Capture-in: persist a segment of the current conversation into Lineage as immutable nodes, ' +
      'with an eager summary. You extract the relevant turns and pass them in — the server never ' +
      'sees the thread. Use on-demand at meaningful moments; do not auto-capture every turn. ' +
      'Omit parentNodeId to start a new tree under a fresh context root, or pass it to attach under an existing node.',
    {
      turns: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']).describe('Who produced this turn'),
            content: z.string().describe('The turn text'),
          }),
        )
        .min(1)
        .describe('Conversation turns extracted from the thread, in chronological order'),
      synopsis: z
        .string()
        .optional()
        .describe(
          'Your characterization of the segment — decisions made, open questions, key entities. ' +
            'Strongly recommended: it conditions the eager summary so the node is good to seed from later.',
        ),
      label: z.string().optional().describe('Human-facing segment/branch label'),
      parentNodeId: z
        .string()
        .optional()
        .describe(
          'Existing node to attach under; omit to create a new tree under a fresh context root',
        ),
    },
    async ({ turns, synopsis, label, parentNodeId }) => {
      // 1. Resolve the attach point.
      let treeId: string;
      let parentId: string;
      let contextNodeId: string | null = null;
      if (parentNodeId) {
        let parent: Node;
        try {
          parent = await repo.getNode(parentNodeId);
        } catch {
          return {
            content: [{ type: 'text', text: `Parent node not found: ${parentNodeId}` }],
            isError: true,
          };
        }
        treeId = parent.treeId;
        parentId = parentNodeId;
      } else {
        // Mint a new tree under a fresh context root (logical 'context' via metadata).
        treeId = crypto.randomUUID();
        const rootNodeId = crypto.randomUUID();
        await repo.putTree({
          treeId,
          title: label ?? 'Checkpoint',
          createdAt: new Date().toISOString(),
          rootNodeId,
          contextSources: null,
        });
        await repo.putNode(
          createNode({
            nodeId: rootNodeId,
            treeId,
            parentId: null,
            type: 'human',
            content: synopsis ?? '',
            metadata: { kind: 'context' },
          }),
        );
        contextNodeId = rootNodeId;
        parentId = rootNodeId;
      }

      // 2. Persist the turns as an immutable chain.
      const nodeIds: string[] = [];
      let prev = parentId;
      for (const turn of turns) {
        const node = createNode({
          treeId,
          parentId: prev,
          type: turn.role === 'user' ? 'human' : 'ai',
          content: turn.content,
          metadata: label !== undefined ? { label } : null,
        });
        await repo.putNode(node);
        nodeIds.push(node.nodeId);
        prev = node.nodeId;
      }
      const lastNodeId = prev;

      // 3. Eager summary (reuse the seeding summary pipeline).
      let summary: string;
      if (llm) {
        summary = await llmSummarize(repo, llm, treeId, lastNodeId);
      } else if (synopsis) {
        summary = synopsis;
      } else {
        summary = turns
          .map(
            (t) => `[${t.role}] ${t.content.slice(0, 100)}${t.content.length > 100 ? '...' : ''}`,
          )
          .join('\n');
      }

      let summaryNodeId: string | null = null;
      if (summary.trim()) {
        const summaryNode = createNode({
          treeId,
          parentId: lastNodeId,
          type: 'summary',
          content: summary,
          metadata: synopsis !== undefined ? { synopsis } : null,
        });
        await repo.putNode(summaryNode);
        summaryNodeId = summaryNode.nodeId;

        // 4. Eager embedding (guarded — no-op without an embedding provider).
        if (embedding) {
          try {
            const [vec] = await embedding.embed([summary]);
            if (vec) await repo.updateNodeEmbedding(summaryNodeId, vec, embedding.modelId);
          } catch {
            // Best-effort: a background embedding job can backfill later.
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                treeId,
                contextNodeId,
                nodeIds,
                summaryNodeId,
                summary,
                ...(makeUrl(treeId, lastNodeId) && { url: makeUrl(treeId, lastNodeId) }),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'lineage_view',
    'Orient: return a focused subtree (ancestry + focal node + direct children + off-spine refs) ' +
      'around a node — not the full graph. Each node carries its nodeId so you can branch from it with ' +
      'lineage_seed. Omit nodeId to focus the most recently created node.',
    {
      nodeId: z
        .string()
        .optional()
        .describe('Focal node ID; omit to use the most recently created node across all trees'),
    },
    async ({ nodeId }) => {
      let focal: Node;
      if (nodeId) {
        try {
          focal = await repo.getNode(nodeId);
        } catch {
          return { content: [{ type: 'text', text: `Node not found: ${nodeId}` }], isError: true };
        }
      } else {
        const trees = await repo.listTrees();
        const all: Node[] = [];
        for (const t of trees) all.push(...(await repo.getNodes(t.treeId)));
        const active = all.filter((n) => !n.isDeleted);
        if (active.length === 0) {
          return { content: [{ type: 'text', text: 'No nodes found.' }] };
        }
        active.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        focal = active[0]!;
      }

      const allNodes = await repo.getNodes(focal.treeId);
      const nodeMap = new Map(allNodes.map((n) => [n.nodeId, n]));

      const ancestry: Node[] = [];
      let cur = focal.parentId ? nodeMap.get(focal.parentId) : undefined;
      while (cur) {
        ancestry.unshift(cur);
        cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
      }

      const children = allNodes.filter((n) => n.parentId === focal.nodeId && !n.isDeleted);
      const refs = await repo.getCrossTreeRefs({
        fromTreeId: focal.treeId,
        fromNodeId: focal.nodeId,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                focus: focal,
                ancestry,
                children,
                refs,
                hint: 'To branch out from any node here, call lineage_seed with its nodeId.',
                ...(makeUrl(focal.treeId, focal.nodeId) && {
                  url: makeUrl(focal.treeId, focal.nodeId),
                }),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'lineage_seed',
    'Branch-out: build a copy-ready context seed from selected nodes so the user can start a fresh ' +
      'chat pre-seeded with this context. Eagerly summarizes the selection, creates a seed tree whose ' +
      'context sources are those summaries, and returns seedText to paste into a new chat. ' +
      'NOTE: the widget cannot open a new chat — branch-out is always paste-based.',
    {
      nodeIds: z
        .array(contextSourceSchema)
        .min(1)
        .describe('Source nodes (treeId + nodeId each) to seed the new conversation from'),
      intentLabel: z
        .string()
        .describe(
          'Required: how this branch diverges, captured at fork time. Prefer one of ' +
            'sequence | alternative | elaboration | objection; freeform is allowed.',
        ),
      title: z.string().optional().describe('Title for the seed tree'),
    },
    async ({ nodeIds, intentLabel, title }) => {
      // Resolve each source to a summary (shared pin→summary logic).
      const resolution = await resolveToSummaries(repo, llm, nodeIds);
      if ('error' in resolution) {
        return { content: [{ type: 'text', text: resolution.error }], isError: true };
      }
      const resolvedSources = resolution.resolved;

      // Create the seed tree with the resolved summaries as context sources.
      const treeId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const seedTitle = title ?? `Seed: ${intentLabel}`;

      await repo.putTree({
        treeId,
        title: seedTitle,
        createdAt,
        rootNodeId,
        contextSources: resolvedSources,
      });

      // The seed root has no parent edge, so intent lives in metadata (a known
      // BRANCH_INTENTS value is recorded explicitly for downstream filtering).
      const knownIntent = (Object.values(BRANCH_INTENTS) as string[]).includes(intentLabel);
      await repo.putNode(
        createNode({
          nodeId: rootNodeId,
          treeId,
          parentId: null,
          type: 'human',
          content: '',
          metadata: { intentLabel, ...(knownIntent && { intent: intentLabel }) },
        }),
      );

      const contextBlock = await assembleContext(repo, resolvedSources);
      const seedText = `Branch intent: ${intentLabel}\n\n${contextBlock}`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                seedTreeId: treeId,
                seedNodeId: rootNodeId,
                intentLabel,
                contextSources: resolvedSources,
                seedText,
                note: 'Paste seedText into a fresh Claude chat to continue this branch. The widget cannot open a new chat for you.',
                ...(makeUrl(treeId, rootNodeId) && { url: makeUrl(treeId, rootNodeId) }),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'lineage_synthesize',
    'Synthesize: write a node that synthesizes several source branches, linked to each source via ' +
      'soft (off-spine) synthesis_link references. No merge, no DAG — the sources are referenced, not copied.',
    {
      nodeIds: z
        .array(contextSourceSchema)
        .min(1)
        .describe('Source nodes (treeId + nodeId each) being synthesized'),
      synthesis: z.string().describe('Your synthesis of the selected branches'),
      label: z.string().optional().describe('Optional label for the synthesis node'),
      attachTreeId: z.string().describe('Tree to attach the synthesis node to'),
      attachParentNodeId: z.string().describe('Parent node the synthesis hangs from'),
    },
    async ({ nodeIds, synthesis, label, attachTreeId, attachParentNodeId }) => {
      try {
        await repo.getNode(attachParentNodeId);
      } catch {
        return {
          content: [{ type: 'text', text: `Attach parent node not found: ${attachParentNodeId}` }],
          isError: true,
        };
      }

      const sourceNodes: Node[] = [];
      for (const s of nodeIds) {
        try {
          sourceNodes.push(await repo.getNode(s.nodeId));
        } catch {
          return {
            content: [{ type: 'text', text: `Source node not found: ${s.nodeId}` }],
            isError: true,
          };
        }
      }

      const result = await project(
        repo,
        { nodes: sourceNodes },
        synthesisTransform({ synthesis, ...(label !== undefined && { label }) }),
        { treeId: attachTreeId, parentNodeId: attachParentNodeId },
        { newId: () => crypto.randomUUID(), now: () => new Date().toISOString() },
      );

      const synthNode = result.emittedNodes[0]!;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                synthesisNodeId: synthNode.nodeId,
                links: result.refs,
                ...(makeUrl(attachTreeId, synthNode.nodeId) && {
                  url: makeUrl(attachTreeId, synthNode.nodeId),
                }),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}
