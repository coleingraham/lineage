import type postgres from 'postgres';
import type { Node, NodeRepository, Tree } from '@lineage/core';
export declare class PostgresRepository implements NodeRepository {
  private sql;
  constructor(sql: postgres.Sql);
  migrate(): Promise<void>;
  getTree(treeId: string): Promise<Tree>;
  listTrees(): Promise<Tree[]>;
  putTree(tree: Tree): Promise<void>;
  getNode(nodeId: string): Promise<Node>;
  getNodes(treeId: string): Promise<Node[]>;
  putNode(node: Node): Promise<void>;
  softDeleteNode(nodeId: string): Promise<void>;
  updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void>;
}
//# sourceMappingURL=repository.d.ts.map
