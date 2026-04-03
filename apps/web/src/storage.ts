import type { NodeRepository } from '@lineage/core';

export type StorageMode = 'local' | 'remote';

export interface StorageConfig {
  mode: StorageMode;
  serverUrl?: string;
}

/**
 * Detect which storage mode to use at startup.
 * If a server URL is stored in localStorage, use the REST API; otherwise fall
 * back to browser-local wa-sqlite + OPFS.
 */
export function detectStorageMode(): StorageConfig {
  const serverUrl =
    typeof localStorage !== 'undefined' ? localStorage.getItem('lineage:serverUrl') : null;

  return serverUrl ? { mode: 'remote', serverUrl } : { mode: 'local' };
}

/**
 * Create a `NodeRepository` for the requested storage mode.
 *
 * - **local** — uses `BrowserSqliteRepository` (wa-sqlite + OPFS) for fully
 *   offline, local-first operation.
 * - **remote** — intended to use the `@lineage/sdk` REST client once
 *   implemented.
 */
export async function createStorage(config?: StorageConfig): Promise<NodeRepository> {
  const resolved = config ?? detectStorageMode();

  switch (resolved.mode) {
    case 'local': {
      const { BrowserSqliteRepository } = await import('@lineage/adapter-sqlite/browser');
      return BrowserSqliteRepository.create();
    }
    case 'remote': {
      throw new Error(
        'Remote storage is not yet implemented — clear the lineage:serverUrl localStorage key to use local mode',
      );
    }
  }
}
