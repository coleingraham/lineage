import type { Node, NodeRepository, Tree, SearchOptions, SearchResult } from '@lineage/core';

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

  async searchNodes(options: SearchOptions): Promise<SearchResult[]> {
    const q = options.query.toLowerCase();
    const results: SearchResult[] = [];
    for (const node of this.nodes.values()) {
      if (!options.includeDeleted && node.isDeleted) continue;
      if (options.treeId && node.treeId !== options.treeId) continue;
      if (
        options.nodeTypes &&
        options.nodeTypes.length > 0 &&
        !options.nodeTypes.includes(node.type)
      )
        continue;
      if (!node.content.toLowerCase().includes(q)) continue;
      const tree = this.trees.get(node.treeId);
      results.push({ node, treeTitle: tree?.title ?? '' });
    }
    return results;
  }

  async searchTrees(query: string): Promise<Tree[]> {
    const q = query.toLowerCase();
    return [...this.trees.values()].filter((t) => t.title.toLowerCase().includes(q));
  }
}
