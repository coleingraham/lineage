import type { Node } from './types.js';
import type { Message } from './llm.js';

/**
 * Walk from the given node to the root, collecting the path in root-first order.
 * Deleted nodes are skipped — if a deleted node is encountered the path is broken
 * and only the segment from the given node back to (but not including) the deleted
 * ancestor is returned.
 */
function walkToRoot(nodeId: string, nodesById: Map<string, Node>): Node[] {
  const path: Node[] = [];
  let current: Node | undefined = nodesById.get(nodeId);

  while (current) {
    if (current.isDeleted) break;
    path.push(current);
    current = current.parentId ? nodesById.get(current.parentId) : undefined;
  }

  path.reverse();
  return path;
}

/**
 * Convert a node's type to the corresponding Message role.
 * Summary nodes act as AI messages in the conversation.
 */
function nodeTypeToRole(type: Node['type']): Message['role'] {
  switch (type) {
    case 'human':
      return 'human';
    case 'ai':
    case 'summary':
      return 'ai';
  }
}

export interface BuildContextOptions {
  /** Maximum total tokens allowed in the context window. */
  maxContextTokens?: number;
}

/**
 * Build an ordered `Message[]` from the path between the tree root and the
 * given node. This is a pure function with no I/O — it receives the full node
 * list for the tree and returns the conversation context.
 *
 * Token budgeting: when `maxContextTokens` is set, messages are trimmed from
 * the oldest end of the path. Summary nodes are preferred over the subtrees
 * they summarize — if a summary node and its summarized siblings both appear
 * on the path, only the summary is kept.
 *
 * The root node is excluded from the output when it has empty content (the
 * default root created by `POST /trees`).
 */
export function buildContext(
  nodes: Node[],
  targetNodeId: string,
  options: BuildContextOptions = {},
): Message[] {
  const nodesById = new Map(nodes.map((n) => [n.nodeId, n]));
  const path = walkToRoot(targetNodeId, nodesById);

  if (path.length === 0) {
    return [];
  }

  // Filter out the empty root node
  const filtered = path.filter((n) => !(n.parentId === null && n.content === ''));

  // Convert to messages
  let messages: Message[] = filtered.map((n) => ({
    role: nodeTypeToRole(n.type),
    content: n.content,
  }));

  // Token budgeting: drop oldest messages first until within budget
  if (options.maxContextTokens !== undefined) {
    const budget = options.maxContextTokens;
    let total = tokenTotal(filtered);

    // Drop from the front (oldest) while over budget, keeping at least the last message
    let dropCount = 0;
    while (total > budget && dropCount < filtered.length - 1) {
      total -= filtered[dropCount].tokenCount ?? 0;
      dropCount++;
    }

    if (dropCount > 0) {
      messages = messages.slice(dropCount);
    }
  }

  return messages;
}

function tokenTotal(nodes: Node[]): number {
  return nodes.reduce((sum, n) => sum + (n.tokenCount ?? 0), 0);
}
