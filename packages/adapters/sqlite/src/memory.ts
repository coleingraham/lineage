import type {
  Node,
  NodeRepository,
  Tag,
  TagCategory,
  Tree,
  SearchOptions,
  SearchResult,
  SemanticSearchResult,
} from '@lineage/core';

export class InMemoryRepository implements NodeRepository {
  private trees = new Map<string, Tree>();
  private nodes = new Map<string, Node>();
  private categories = new Map<string, TagCategory>();
  private tags = new Map<string, Tag>();
  private nodeTags = new Map<string, Set<string>>(); // nodeId → tagIds
  private treeTags = new Map<string, Set<string>>(); // treeId → tagIds

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
        this.nodeTags.delete(nodeId);
        this.nodes.delete(nodeId);
      }
    }
    this.treeTags.delete(treeId);
    this.trees.delete(treeId);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: in-memory backend does not support embeddings
  }

  async semanticSearch(): Promise<SemanticSearchResult[]> {
    throw new Error('Semantic search is not supported by the in-memory backend');
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

  // ── Tag category CRUD ──────────────────────────────────────────────────

  async createCategory(category: TagCategory): Promise<void> {
    if (this.categories.has(category.categoryId)) {
      throw new Error(`Category already exists: ${category.categoryId}`);
    }
    for (const existing of this.categories.values()) {
      if (existing.name === category.name) {
        throw new Error(`Category name already exists: ${category.name}`);
      }
    }
    this.categories.set(category.categoryId, category);
  }

  async getCategory(categoryId: string): Promise<TagCategory> {
    const cat = this.categories.get(categoryId);
    if (!cat) throw new Error(`Category not found: ${categoryId}`);
    return cat;
  }

  async listCategories(): Promise<TagCategory[]> {
    return [...this.categories.values()];
  }

  async updateCategory(
    categoryId: string,
    fields: { name?: string; description?: string },
  ): Promise<void> {
    const cat = this.categories.get(categoryId);
    if (!cat) throw new Error(`Category not found: ${categoryId}`);
    if (fields.name !== undefined) {
      for (const existing of this.categories.values()) {
        if (existing.name === fields.name && existing.categoryId !== categoryId) {
          throw new Error(`Category name already exists: ${fields.name}`);
        }
      }
    }
    this.categories.set(categoryId, {
      ...cat,
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.description !== undefined && { description: fields.description }),
    });
  }

  async deleteCategory(categoryId: string): Promise<void> {
    if (!this.categories.has(categoryId)) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    for (const tag of this.tags.values()) {
      if (tag.categoryId === categoryId) {
        throw new Error(`Cannot delete category: it still has tags`);
      }
    }
    this.categories.delete(categoryId);
  }

  // ── Tag CRUD ───────────────────────────────────────────────────────────

  async createTag(tag: Tag): Promise<void> {
    if (this.tags.has(tag.tagId)) {
      throw new Error(`Tag already exists: ${tag.tagId}`);
    }
    if (!this.categories.has(tag.categoryId)) {
      throw new Error(`Category not found: ${tag.categoryId}`);
    }
    for (const existing of this.tags.values()) {
      if (existing.categoryId === tag.categoryId && existing.name === tag.name) {
        throw new Error(`Tag name already exists in this category: ${tag.name}`);
      }
    }
    this.tags.set(tag.tagId, tag);
  }

  async getTag(tagId: string): Promise<Tag> {
    const tag = this.tags.get(tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);
    return tag;
  }

  async listTags(categoryId?: string): Promise<Tag[]> {
    const all = [...this.tags.values()];
    if (categoryId !== undefined) {
      return all.filter((t) => t.categoryId === categoryId);
    }
    return all;
  }

  async updateTag(tagId: string, fields: { name?: string; description?: string }): Promise<void> {
    const tag = this.tags.get(tagId);
    if (!tag) throw new Error(`Tag not found: ${tagId}`);
    if (fields.name !== undefined) {
      for (const existing of this.tags.values()) {
        if (
          existing.categoryId === tag.categoryId &&
          existing.name === fields.name &&
          existing.tagId !== tagId
        ) {
          throw new Error(`Tag name already exists in this category: ${fields.name}`);
        }
      }
    }
    this.tags.set(tagId, {
      ...tag,
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.description !== undefined && { description: fields.description }),
    });
  }

  async deleteTag(tagId: string): Promise<void> {
    if (!this.tags.has(tagId)) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    this.tags.delete(tagId);
    // Cascade: remove from all junction tables
    for (const [, tagSet] of this.nodeTags) {
      tagSet.delete(tagId);
    }
    for (const [, tagSet] of this.treeTags) {
      tagSet.delete(tagId);
    }
  }

  // ── Tagging operations ─────────────────────────────────────────────────

  async tagNode(nodeId: string, tagIds: string[]): Promise<void> {
    if (!this.nodes.has(nodeId)) throw new Error(`Node not found: ${nodeId}`);
    let set = this.nodeTags.get(nodeId);
    if (!set) {
      set = new Set();
      this.nodeTags.set(nodeId, set);
    }
    for (const tagId of tagIds) {
      if (!this.tags.has(tagId)) throw new Error(`Tag not found: ${tagId}`);
      set.add(tagId);
    }
  }

  async untagNode(nodeId: string, tagIds: string[]): Promise<void> {
    const set = this.nodeTags.get(nodeId);
    if (!set) return;
    for (const tagId of tagIds) {
      set.delete(tagId);
    }
  }

  async getNodeTags(nodeId: string): Promise<Tag[]> {
    const set = this.nodeTags.get(nodeId);
    if (!set) return [];
    return [...set].map((id) => this.tags.get(id)).filter((t): t is Tag => t !== undefined);
  }

  async tagTree(treeId: string, tagIds: string[]): Promise<void> {
    if (!this.trees.has(treeId)) throw new Error(`Tree not found: ${treeId}`);
    let set = this.treeTags.get(treeId);
    if (!set) {
      set = new Set();
      this.treeTags.set(treeId, set);
    }
    for (const tagId of tagIds) {
      if (!this.tags.has(tagId)) throw new Error(`Tag not found: ${tagId}`);
      set.add(tagId);
    }
  }

  async untagTree(treeId: string, tagIds: string[]): Promise<void> {
    const set = this.treeTags.get(treeId);
    if (!set) return;
    for (const tagId of tagIds) {
      set.delete(tagId);
    }
  }

  async getTreeTags(treeId: string): Promise<Tag[]> {
    const set = this.treeTags.get(treeId);
    if (!set) return [];
    return [...set].map((id) => this.tags.get(id)).filter((t): t is Tag => t !== undefined);
  }

  // ── Tag-based queries ──────────────────────────────────────────────────

  async findNodesByTags(
    tagIds: string[],
    options?: { treeId?: string; matchAll?: boolean },
  ): Promise<Node[]> {
    if (tagIds.length === 0) return [];
    const matchAll = options?.matchAll ?? true;
    const match = matchAll
      ? (set: Set<string>) => tagIds.every((id) => set.has(id))
      : (set: Set<string>) => tagIds.some((id) => set.has(id));
    const results: Node[] = [];
    for (const [nodeId, tagSet] of this.nodeTags) {
      if (match(tagSet)) {
        const node = this.nodes.get(nodeId);
        if (node && !node.isDeleted) {
          if (options?.treeId && node.treeId !== options.treeId) continue;
          results.push(node);
        }
      }
    }
    return results;
  }

  async findTreesByTags(tagIds: string[], options?: { matchAll?: boolean }): Promise<Tree[]> {
    if (tagIds.length === 0) return [];
    const matchAll = options?.matchAll ?? true;
    const match = matchAll
      ? (set: Set<string>) => tagIds.every((id) => set.has(id))
      : (set: Set<string>) => tagIds.some((id) => set.has(id));
    const results: Tree[] = [];
    for (const [treeId, tagSet] of this.treeTags) {
      if (match(tagSet)) {
        const tree = this.trees.get(treeId);
        if (tree) results.push(tree);
      }
    }
    return results;
  }
}
