import type { NodeRepository } from '@lineage/core';
import { Capacitor } from '@capacitor/core';

/**
 * Create the on-device `NodeRepository` for the foldable app.
 *
 * - **Native (Android/iOS via Capacitor)** — file-based SQLite through the
 *   `@capacitor-community/sqlite` plugin. Local-first: the database lives on the
 *   device and can be backed up; there is no server.
 * - **Desktop browser (dev)** — sql.js (WASM SQLite) persisted to IndexedDB, so
 *   the size-inferred layout and authoring flows can be exercised without a
 *   device. Data survives reloads.
 */
export async function createStorage(): Promise<NodeRepository> {
  if (Capacitor.isNativePlatform()) {
    const { CapacitorSqliteRepository } = await import('@lineage/adapter-capacitor-sqlite');
    return CapacitorSqliteRepository.create('lineage');
  }

  const { BrowserSqliteRepository } = await import('@lineage/adapter-sqlite/browser');
  return BrowserSqliteRepository.create('lineage-foldable');
}
