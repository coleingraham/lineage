import type { Node, Tree } from './types.js';

export interface NodeRepository {
  getTree(treeId: string): Promise<Tree>;
  listTrees(): Promise<Tree[]>;
  putTree(tree: Tree): Promise<void>;
  getNode(nodeId: string): Promise<Node>;
  getNodes(treeId: string): Promise<Node[]>;
  putNode(node: Node): Promise<void>;
  softDeleteNode(nodeId: string): Promise<void>;
  deleteTree(treeId: string): Promise<void>;
  updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void>;
}
