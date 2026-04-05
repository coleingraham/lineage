import type { GraphNode } from './GraphRendererTypes.js';
import { getAncestorIds } from './graphUtils.js';

/**
 * Build a lookup from parentId → children for quick traversal.
 */
export function buildChildrenMap(nodes: GraphNode[]): Map<string | null, GraphNode[]> {
  const map = new Map<string | null, GraphNode[]>();
  for (const n of nodes) {
    const siblings = map.get(n.parentId) ?? [];
    siblings.push(n);
    map.set(n.parentId, siblings);
  }
  return map;
}

/**
 * Starting from a given node, follow the most recently created child
 * at each level until a leaf is reached. Returns the leaf node's id,
 * or the starting node's id if it is already a leaf.
 */
export function findDeepestFirstChild(
  startId: string,
  nodeById: Map<string, GraphNode>,
  childrenOf: Map<string | null, GraphNode[]>,
): string {
  let cur = nodeById.get(startId);
  if (!cur) return startId;
  while (true) {
    const children = childrenOf.get(cur.id);
    if (!children || children.length === 0) break;
    cur = children.reduce((newest, child) =>
      child.metadata.createdAt > newest.metadata.createdAt ? child : newest,
    );
  }
  return cur.id;
}

/**
 * Build the list of { node, siblings } entries for the active path
 * from root to the selected node.
 */
export function buildPathEntries(
  selectedNodeId: string,
  nodes: GraphNode[],
  nodeById: Map<string, GraphNode>,
  childrenOf: Map<string | null, GraphNode[]>,
): { node: GraphNode; siblings: GraphNode[] }[] {
  const path = getAncestorIds(nodes, selectedNodeId);
  return path.map((id) => {
    const node = nodeById.get(id)!;
    const siblings = childrenOf.get(node.parentId) ?? [node];
    return { node, siblings };
  });
}
