import { useState, useEffect } from 'react';
import type { Tree, NodeRepository } from '@lineage/core';

/**
 * Fetches the list of trees from the repository.
 * Re-fetches when `repo` or `refreshKey` changes.
 */
export function useTreeList(
  repo: NodeRepository | null,
  refreshKey = 0,
): { trees: Tree[]; isLoading: boolean; error: Error | null } {
  const [trees, setTrees] = useState<Tree[]>([]);
  const [isLoading, setIsLoading] = useState(!!repo);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    repo
      .listTrees()
      .then((t) => {
        if (!cancelled) setTrees(t);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repo, refreshKey]);

  return { trees, isLoading, error };
}
