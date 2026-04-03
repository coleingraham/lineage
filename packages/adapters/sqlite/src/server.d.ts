import type Database from 'better-sqlite3';
import type { Node, NodeRepository, Tree } from '@lineage/core';
export declare class SqliteRepository implements NodeRepository {
  private db;
  constructor(db: Database.Database);
  getTree(treeId: string): Promise<Tree>;
  listTrees(): Promise<Tree[]>;
  putTree(tree: Tree): Promise<void>;
  getNode(nodeId: string): Promise<Node>;
  getNodes(treeId: string): Promise<Node[]>;
  putNode(node: Node): Promise<void>;
  softDeleteNode(nodeId: string): Promise<void>;
  updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map
