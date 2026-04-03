import type { GraphNode } from './GraphRendererTypes.js';

export function getAncestorIds(nodes: GraphNode[], nodeId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: string[] = [];
  let cur = byId.get(nodeId);
  while (cur) {
    path.unshift(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

export interface FlatNode extends GraphNode {
  _children: GraphNode[];
}

export function buildFlatList(nodes: GraphNode[]): FlatNode[] {
  const childrenMap = new Map<string | null, GraphNode[]>();
  for (const n of nodes) {
    const siblings = childrenMap.get(n.parentId) ?? [];
    siblings.push(n);
    childrenMap.set(n.parentId, siblings);
  }
  return nodes.map((n) => ({
    ...n,
    _children: childrenMap.get(n.id) ?? [],
  }));
}

export function findRoot(nodes: GraphNode[]): GraphNode | undefined {
  return nodes.find((n) => n.parentId === null);
}
