import type { Node } from '@lineage/core';
import { buildChildrenMap, childrenOf } from './tree.js';

export interface TreeLayout {
  /** Per node: fractional column and integer depth (row). */
  pos: Map<string, { col: number; depth: number }>;
  maxCol: number;
  maxDepth: number;
}

/**
 * Simple top-down tidy-tree layout (Reingold–Tilford "leaf-centering" variant,
 * no library): leaves get successive columns; each parent is centred over its
 * children; depth is the row. Good enough for the modest monologue trees a
 * single author builds. Deleted nodes should be excluded by the caller.
 */
export function layoutTree(nodes: Node[]): TreeLayout {
  const pos = new Map<string, { col: number; depth: number }>();
  const root = nodes.find((n) => n.parentId === null);
  if (!root) return { pos, maxCol: 0, maxDepth: 0 };

  const childrenMap = buildChildrenMap(nodes);
  let nextLeaf = 0;
  let maxDepth = 0;

  const walk = (id: string, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const kids = childrenOf(childrenMap, id);
    let col: number;
    if (kids.length === 0) {
      col = nextLeaf++;
    } else {
      const cols = kids.map((k) => walk(k.nodeId, depth + 1));
      col = (cols[0] + cols[cols.length - 1]) / 2;
    }
    pos.set(id, { col, depth });
    return col;
  };

  walk(root.nodeId, 0);
  return { pos, maxCol: nextLeaf > 0 ? nextLeaf - 1 : 0, maxDepth };
}
