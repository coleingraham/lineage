import type { Node } from '@lineage/core';

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

export interface MillerColumn {
  items: Node[];
  /** The node on the active path shown in this column, if any. */
  selectedId: string | null;
}

/**
 * Build Miller-column data for the flat view: column 0 is the root level, and
 * each subsequent column is the children of the path node before it, with the
 * on-path node marked selected. Trailing empty columns (a focused leaf) are
 * omitted. `path` is root→focused (from {@link pathToRoot}).
 */
export function buildColumns(childrenMap: Map<string | null, Node[]>, path: Node[]): MillerColumn[] {
  const roots = [...(childrenMap.get(null) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const columns: MillerColumn[] = [{ items: roots, selectedId: path[0]?.nodeId ?? null }];
  for (let i = 0; i < path.length; i++) {
    const kids = childrenOf(childrenMap, path[i].nodeId);
    if (kids.length === 0) break;
    columns.push({ items: kids, selectedId: path[i + 1]?.nodeId ?? null });
  }
  return columns;
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
 * Like {@link pathToRoot}, but a **summary node is a context boundary**: the
 * walk stops at the nearest (lowest) summary ancestor, inclusive — matching
 * core's `walkToRoot`. Used to build the context an AI reply/summary sees, so
 * it traverses up to the root or the lowest summary, whichever comes first.
 * Stops if a deleted node is hit.
 */
export function pathToSummaryOrRoot(nodeMap: Map<string, Node>, focusedNodeId: string): Node[] {
  const path: Node[] = [];
  let cur: Node | undefined = nodeMap.get(focusedNodeId);
  while (cur) {
    if (cur.isDeleted) break;
    path.push(cur);
    if (cur.type === 'summary') break;
    cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
  }
  return path.reverse();
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
