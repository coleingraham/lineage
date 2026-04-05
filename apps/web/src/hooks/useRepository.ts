import { useState, useEffect } from 'react';
import type { NodeRepository } from '@lineage/core';
import { createStorage } from '../storage.js';

/**
 * Creates and caches a NodeRepository based on the current storage settings.
 * Reinitializes when `settingsVersion` changes (bump it after saving Settings).
 */
export function useRepository(settingsVersion = 0) {
  const [repo, setRepo] = useState<NodeRepository | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    createStorage()
      .then((r) => {
        if (!cancelled) setRepo(r);
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
  }, [settingsVersion]);

  return { repo, error, isLoading };
}
