import { useEffect, useState } from 'react';
import type { Node, NodeRepository, Tree } from '@lineage/core';

/** Load all trees, refreshing when `refreshKey` changes. */
export function useTreeList(repo: NodeRepository | null, refreshKey: number): Tree[] {
  const [trees, setTrees] = useState<Tree[]>([]);

  useEffect(() => {
    if (!repo) return;
    let active = true;
    repo.listTrees().then((t) => {
      if (active) setTrees(t);
    });
    return () => {
      active = false;
    };
  }, [repo, refreshKey]);

  return trees;
}

/** Load the (non-deleted) nodes of a tree, refreshing when `refreshKey` changes. */
export function useTreeData(
  repo: NodeRepository | null,
  treeId: string | null,
  refreshKey: number,
): { nodes: Node[]; loading: boolean } {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!repo || !treeId) {
      setNodes([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    repo.getNodes(treeId).then((all) => {
      if (!active) return;
      setNodes(all.filter((n) => !n.isDeleted));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [repo, treeId, refreshKey]);

  return { nodes, loading };
}
