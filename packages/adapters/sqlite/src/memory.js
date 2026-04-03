export class InMemoryRepository {
  trees = new Map();
  nodes = new Map();
  async getTree(treeId) {
    const tree = this.trees.get(treeId);
    if (!tree) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return tree;
  }
  async listTrees() {
    return [...this.trees.values()];
  }
  async putTree(tree) {
    this.trees.set(tree.treeId, tree);
  }
  async getNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return node;
  }
  async getNodes(treeId) {
    return [...this.nodes.values()].filter((n) => n.treeId === treeId);
  }
  async putNode(node) {
    this.nodes.set(node.nodeId, node);
  }
  async softDeleteNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    this.nodes.set(nodeId, { ...node, isDeleted: true });
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId, embedding, model) {
    // No-op: in-memory backend does not support embeddings
  }
}
//# sourceMappingURL=memory.js.map
