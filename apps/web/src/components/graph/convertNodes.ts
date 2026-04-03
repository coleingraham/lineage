import type { Node } from '@lineage/core';
import type { GraphNode } from './GraphRendererTypes.js';

export function toGraphNodes(nodes: Node[]): GraphNode[] {
  const childCounts = new Map<string, number>();
  for (const n of nodes) {
    if (n.parentId) {
      childCounts.set(n.parentId, (childCounts.get(n.parentId) ?? 0) + 1);
    }
  }

  const depths = computeDepths(nodes);

  return nodes.map((n) => ({
    id: n.nodeId,
    type: n.type,
    content: n.content,
    parentId: n.parentId,
    depth: depths.get(n.nodeId) ?? 0,
    isDeleted: n.isDeleted,
    childCount: childCounts.get(n.nodeId) ?? 0,
    metadata: {
      modelName: n.modelName,
      provider: n.provider,
      tokenCount: n.tokenCount,
      createdAt: n.createdAt,
    },
  }));
}

export function computeDepths(nodes: Node[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const depths = new Map<string, number>();

  function getDepth(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    const node = byId.get(id);
    if (!node || !node.parentId) {
      depths.set(id, 0);
      return 0;
    }
    const d = getDepth(node.parentId) + 1;
    depths.set(id, d);
    return d;
  }

  for (const n of nodes) {
    getDepth(n.nodeId);
  }
  return depths;
}
