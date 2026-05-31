import { useEffect, useState } from 'react';
import type { NodeRepository } from '@lineage/core';
import { createStorage } from '../storage.js';

/** Create the on-device repository once on mount. Null until ready. */
export function useRepository(): NodeRepository | null {
  const [repo, setRepo] = useState<NodeRepository | null>(null);

  useEffect(() => {
    let active = true;
    createStorage()
      .then((r) => {
        if (active) setRepo(r);
      })
      .catch((err) => {
        console.error('[foldable] failed to open storage', err);
      });
    return () => {
      active = false;
    };
  }, []);

  return repo;
}
