import type { Node, NodeRepository, Tree } from '@lineage/core';

const NOT_IMPLEMENTED = 'BrowserSqliteRepository not implemented — see THO-25';

/**
 * Browser-side SQLite repository using wa-sqlite + OPFS.
 * Stub implementation — see THO-25 for full implementation.
 */
export class BrowserSqliteRepository implements NodeRepository {
  getTree(): Promise<Tree> {
    throw new Error(NOT_IMPLEMENTED);
  }

  listTrees(): Promise<Tree[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  putTree(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  getNode(): Promise<Node> {
    throw new Error(NOT_IMPLEMENTED);
  }

  getNodes(): Promise<Node[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  putNode(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  softDeleteNode(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  updateNodeEmbedding(): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
