import type { NodeRepository } from '@lineage/core';

export type StorageMode = 'local' | 'remote' | 'tauri';

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
  // Auto-detect Tauri runtime. The desktop app bundles a server sidecar
  // on port 3210 for LLM and data operations. Use remote mode against it
  // so the server has the context it needs for completions.
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const serverUrl = 'http://localhost:3210';
    // Persist so streaming callbacks can read it from localStorage
    localStorage.setItem('lineage:serverUrl', serverUrl);
    return { mode: 'remote', serverUrl };
  }

  if (typeof localStorage === 'undefined')
    return { mode: 'remote', serverUrl: 'http://localhost:3000' };

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
      const { BrowserSqliteRepository } = await import('@lineage/adapter-sqlite/browser');
      return BrowserSqliteRepository.create();
    }
    case 'remote': {
      const { RestNodeRepository } = await import('@lineage/sdk');
      return new RestNodeRepository({ baseUrl: resolved.serverUrl! });
    }
    case 'tauri': {
      const { TauriSqliteRepository } = await import('@lineage/adapter-tauri-sqlite');
      return TauriSqliteRepository.create();
    }
  }
}
