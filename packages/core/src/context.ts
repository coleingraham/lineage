import type { Node, ContextSource } from './types.js';
import type { Message } from './llm.js';
import type { NodeRepository } from './repository.js';
import { stripThinking } from './content.js';
import { parentIdsOf } from './nodes.js';

/**
 * Collect the ancestry of a node in root-first order, following **all** of a
 * node's parents (see {@link parentIdsOf}) so in-tree merge nodes — which have
 * multiple incoming edges — pull in every merged branch.
 *
 * Rules (identical to the former single-parent walk for ordinary nodes):
 * - Deleted nodes break that branch (they and their ancestors are excluded).
 * - Summary nodes are context boundaries — included, but their parents are not
 *   traversed (the summary replaces the conversation above it).
 * - Diamonds are deduped via `visited`, so a shared ancestor appears once.
 *
 * Ordering: a node's parents are emitted in `parentIdsOf` order (primary first),
 * then the node itself. For a single-parent chain this reproduces the exact
 * root-first order the previous implementation produced.
 */
function collectAncestry(
  nodeId: string,
  nodesById: Map<string, Node>,
  visited: Set<string>,
): Node[] {
  if (visited.has(nodeId)) return [];
  const node = nodesById.get(nodeId);
  if (!node || node.isDeleted) return [];
  visited.add(nodeId);

  // Stop at summary nodes — they replace the conversation above
  if (node.type === 'summary') return [node];

  const out: Node[] = [];
  for (const parentId of parentIdsOf(node)) {
    out.push(...collectAncestry(parentId, nodesById, visited));
  }
  out.push(node);
  return out;
}

/**
 * Convert a node's type to the corresponding Message role.
 * Summary and AI nodes map to 'ai'; system nodes map to 'system';
 * all other types (human, tool_call, tool_result, custom) map to 'human'.
 */
function nodeTypeToRole(type: Node['type']): Message['role'] {
  switch (type) {
    case 'ai':
    case 'summary':
      return 'ai';
    case 'system':
      return 'system';
    default:
      return 'human';
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
  const path = collectAncestry(targetNodeId, nodesById, new Set());

  if (path.length === 0) {
    return [];
  }

  // Filter out the empty root node
  const filtered = path.filter((n) => !(n.parentId === null && n.content === ''));

  // Convert to messages, stripping thinking blockquotes from content
  let messages: Message[] = filtered.map((n) => ({
    role: nodeTypeToRole(n.type),
    content: stripThinking(n.content),
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

/**
 * Resolve an ordered list of context sources into a formatted text block
 * suitable for prepending to the LLM message array as background context.
 *
 * Each source is fetched by `(treeId, nodeId)`. Missing or deleted nodes are
 * skipped with a console warning rather than causing a hard failure.
 */
export async function assembleContext(
  repo: NodeRepository,
  sources: ContextSource[],
): Promise<string> {
  if (sources.length === 0) return '';

  const summaries: string[] = [];

  for (const source of sources) {
    let node: Node;
    try {
      node = await repo.getNode(source.nodeId);
    } catch {
      console.warn(
        `[assembleContext] skipping missing node ${source.nodeId} (tree ${source.treeId})`,
      );
      continue;
    }

    if (node.isDeleted) {
      console.warn(
        `[assembleContext] skipping deleted node ${source.nodeId} (tree ${source.treeId})`,
      );
      continue;
    }

    const content = stripThinking(node.content).trim();
    if (content) {
      summaries.push(content);
    }
  }

  if (summaries.length === 0) return '';

  const header =
    'The following are summaries from prior conversations provided as background context. ' +
    'They are not part of the current conversation but may inform your responses.';

  return [header, '', ...summaries.map((s, i) => `[${i + 1}] ${s}`)].join('\n');
}
