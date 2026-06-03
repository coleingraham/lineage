import type { Node } from '@lineage/core';
import { parentIdsOf } from '@lineage/core';

/** Map of parentId → children, for quick downward traversal. */
export function buildChildrenMap(nodes: Node[]): Map<string | null, Node[]> {
  const map = new Map<string | null, Node[]>();
  for (const n of nodes) {
    const siblings = map.get(n.parentId) ?? [];
    siblings.push(n);
    map.set(n.parentId, siblings);
  }
  return map;
}

/** Map of nodeId → node. */
export function buildNodeMap(nodes: Node[]): Map<string, Node> {
  const map = new Map<string, Node>();
  for (const n of nodes) map.set(n.nodeId, n);
  return map;
}

/** Children of a node, oldest-first (creation order). */
export function childrenOf(childrenMap: Map<string | null, Node[]>, nodeId: string): Node[] {
  const kids = childrenMap.get(nodeId) ?? [];
  return [...kids].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * The active line: the path of nodes from the root down to `focusedNodeId`,
 * root first. This is the "spine you're on" rendered in the cover/linear view.
 */
export function pathToRoot(nodeMap: Map<string, Node>, focusedNodeId: string): Node[] {
  const path: Node[] = [];
  let cur: Node | undefined = nodeMap.get(focusedNodeId);
  while (cur) {
    path.push(cur);
    cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
  }
  return path.reverse();
}

/**
 * Like {@link pathToRoot}, but a **summary node is a context boundary** and a
 * node may have **multiple parents** (an in-tree merge node): the walk follows
 * every parent (see {@link parentIdsOf}), stopping at the nearest summary
 * ancestor on each branch, inclusive — matching core's `collectAncestry`. Used
 * to build the context an AI reply/summary sees, so merged branches' summaries
 * are all included. Deleted nodes and diamonds (shared ancestors) are handled.
 */
export function pathToSummaryOrRoot(nodeMap: Map<string, Node>, focusedNodeId: string): Node[] {
  const visited = new Set<string>();
  function collect(nodeId: string): Node[] {
    if (visited.has(nodeId)) return [];
    const node = nodeMap.get(nodeId);
    if (!node || node.isDeleted) return [];
    visited.add(nodeId);
    if (node.type === 'summary') return [node];
    const out: Node[] = [];
    for (const pid of parentIdsOf(node)) out.push(...collect(pid));
    out.push(node);
    return out;
  }
  return collect(focusedNodeId);
}

/**
 * From a starting node, follow the newest child at each level until a leaf is
 * reached. Used to resolve a tree's default focus (deepest tip of the most
 * recent line) when none is remembered.
 */
export function deepestNewestLeaf(
  startId: string,
  nodeMap: Map<string, Node>,
  childrenMap: Map<string | null, Node[]>,
): string {
  let cur = nodeMap.get(startId);
  if (!cur) return startId;
  while (true) {
    const kids = childrenOf(childrenMap, cur.nodeId);
    if (kids.length === 0) break;
    cur = kids[kids.length - 1];
  }
  return cur.nodeId;
}
