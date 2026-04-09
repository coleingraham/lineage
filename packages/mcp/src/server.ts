import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { NodeRepository, Node } from '@lineage/core';
import { buildContext, createNode } from '@lineage/core';

const contextSourceSchema = z.object({
  treeId: z.string(),
  nodeId: z.string(),
});

export function createMcpServer(repo: NodeRepository): McpServer {
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
    'Record a decision with structured metadata. Creates a tagged node that can be searched and recalled later.',
    {
      treeId: z.string().describe('The session tree ID'),
      parentId: z.string().describe('Parent node ID (typically the current leaf)'),
      summary: z.string().describe('The decision text'),
      reasoning: z.string().optional().describe('Why this decision was made'),
      tags: z.array(z.string()).optional().describe('Categorization tags'),
      files: z.array(z.string()).optional().describe('Related file paths'),
    },
    async ({ treeId, parentId, summary, reasoning, tags, files }) => {
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
      if (tags !== undefined) metadata.tags = tags;
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

      return {
        content: [{ type: 'text', text: JSON.stringify(node, null, 2) }],
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
      mode: z
        .enum(['text', 'semantic'])
        .default('text')
        .describe('Search mode: "text" (substring match) or "semantic" (embedding-based, future)'),
    },
    async ({ query, maxTokens, nodeTypes, treeId, mode }) => {
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

      const results = await repo.searchNodes({ query, nodeTypes, treeId });

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
    'End a coding session. Optionally updates the title and creates a summary node for future reference.',
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

      const summaryContent = summary
        ? summary
        : activeNodes
            .slice(0, 20)
            .map(
              (n) => `[${n.type}] ${n.content.slice(0, 100)}${n.content.length > 100 ? '...' : ''}`,
            )
            .join('\n');

      const summaryNode = createNode({
        treeId,
        parentId: leafNode?.nodeId ?? tree.rootNodeId,
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
      'nodes without summaries are used as-is.',
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
      const resolvedSources: { treeId: string; nodeId: string }[] = [];

      for (const source of sourceNodes) {
        let node: Node;
        try {
          node = await repo.getNode(source.nodeId);
        } catch {
          return {
            content: [{ type: 'text', text: `Source node not found: ${source.nodeId}` }],
            isError: true,
          };
        }

        if (node.type === 'summary') {
          // Summary nodes are used directly
          resolvedSources.push({ treeId: source.treeId, nodeId: node.nodeId });
        } else {
          // Check for an existing summary child
          const treeNodes = await repo.getNodes(node.treeId);
          const summaryChild = treeNodes.find(
            (n) => n.parentId === node.nodeId && n.type === 'summary' && !n.isDeleted,
          );
          if (summaryChild) {
            resolvedSources.push({ treeId: source.treeId, nodeId: summaryChild.nodeId });
          } else {
            // Use the node itself as-is
            resolvedSources.push({ treeId: source.treeId, nodeId: node.nodeId });
          }
        }
      }

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

  return server;
}
