import type { Node, NodeRepository, Tree } from '@lineage/core';

export class InMemoryRepository implements NodeRepository {
  private trees = new Map<string, Tree>();
  private nodes = new Map<string, Node>();

  async getTree(treeId: string): Promise<Tree> {
    const tree = this.trees.get(treeId);
    if (!tree) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return tree;
  }

  async listTrees(): Promise<Tree[]> {
    return [...this.trees.values()];
  }

  async putTree(tree: Tree): Promise<void> {
    this.trees.set(tree.treeId, tree);
  }

  async getNode(nodeId: string): Promise<Node> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return node;
  }

  async getNodes(treeId: string): Promise<Node[]> {
    return [...this.nodes.values()].filter((n) => n.treeId === treeId);
  }

  async putNode(node: Node): Promise<void> {
    this.nodes.set(node.nodeId, node);
  }

  async softDeleteNode(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    this.nodes.set(nodeId, { ...node, isDeleted: true });
  }

  async deleteTree(treeId: string): Promise<void> {
    const tree = this.trees.get(treeId);
    if (!tree) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    for (const [nodeId, node] of this.nodes) {
      if (node.treeId === treeId) {
        this.nodes.delete(nodeId);
      }
    }
    this.trees.delete(treeId);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: in-memory backend does not support embeddings
  }
}
