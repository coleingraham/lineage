import type { NodeRepository } from '@lineage/core';

export type StorageMode = 'local' | 'remote';

export interface StorageConfig {
  mode: StorageMode;
  serverUrl?: string;
}

/**
 * Detect which storage mode to use at startup.
 * Reads the explicit storageMode preference from localStorage.
 * Defaults to 'remote' with the standard dev server URL so the app works
 * out-of-the-box against a running server.
 */
export function detectStorageMode(): StorageConfig {
  if (typeof localStorage === 'undefined') return { mode: 'remote', serverUrl: 'http://localhost:3000' };

  const explicit = localStorage.getItem('lineage:storageMode');
  const serverUrl = localStorage.getItem('lineage:serverUrl');

  if (explicit === 'local') return { mode: 'local' };
  return { mode: 'remote', serverUrl: serverUrl || 'http://localhost:3000' };
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
      // Use a variable so Vite/Rollup cannot statically resolve the import —
      // wa-sqlite ships files that Vite's import analysis cannot follow.
      const mod = '@lineage/adapter-sqlite/browser';
      const { BrowserSqliteRepository } = await import(/* @vite-ignore */ mod);
      return BrowserSqliteRepository.create();
    }
    case 'remote': {
      const { RestNodeRepository } = await import('@lineage/sdk');
      return new RestNodeRepository({ baseUrl: resolved.serverUrl! });
    }
  }
}
