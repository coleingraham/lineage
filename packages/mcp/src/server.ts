import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { NodeRepository } from '@lineage/core';
import { createNode } from '@lineage/core';

export function createMcpServer(repo: NodeRepository): McpServer {
  const server = new McpServer({
    name: 'lineage',
    version: '0.0.1',
  });

  // ── Tree operations ──────────────────────────────────────────────────────

  server.tool('list_trees', 'List all conversation trees', {}, async () => {
    const trees = await repo.listTrees();
    return {
      content: [{ type: 'text', text: JSON.stringify(trees, null, 2) }],
    };
  });

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
    },
    async ({ title, rootContent }) => {
      const treeId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      await repo.putTree({ treeId, title, createdAt, rootNodeId, contextSources: null });
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
    'Update a tree title',
    {
      treeId: z.string().describe('The tree ID'),
      title: z.string().describe('New title'),
    },
    async ({ treeId, title }) => {
      try {
        const tree = await repo.getTree(treeId);
        await repo.putTree({ ...tree, title });
        return { content: [{ type: 'text', text: JSON.stringify({ ...tree, title }, null, 2) }] };
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
    'List all nodes in a conversation tree',
    {
      treeId: z.string().describe('The tree ID'),
      type: z.string().optional().describe('Filter by node type (human, ai, summary, etc.)'),
    },
    async ({ treeId, type }) => {
      try {
        let nodes = await repo.getNodes(treeId);
        if (type) {
          nodes = nodes.filter((n) => n.type === type);
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
    },
    async ({ treeId, parentId, content: nodeContent, type: nodeType }) => {
      try {
        await repo.getTree(treeId);
        await repo.getNode(parentId);
      } catch {
        return {
          content: [{ type: 'text', text: 'Tree or parent node not found' }],
          isError: true,
        };
      }

      const node = createNode({ treeId, parentId, type: nodeType, content: nodeContent });
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

  return server;
}
