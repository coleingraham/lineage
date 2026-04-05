import { useState, useEffect } from 'react';
import type { Node, Tree, NodeRepository } from '@lineage/core';

export function useTreeData(
  treeId: string | null,
  repo: NodeRepository | null,
  refreshKey = 0,
): { tree: Tree | null; nodes: Node[]; isLoading: boolean; error: Error | null } {
  const [tree, setTree] = useState<Tree | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!treeId || !repo) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([repo.getTree(treeId), repo.getNodes(treeId)])
      .then(([t, n]) => {
        if (cancelled) return;
        setTree(t);
        setNodes(n);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [treeId, repo, refreshKey]);

  return { tree, nodes, isLoading, error };
}
