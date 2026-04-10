import type { Node, Tree, Tag, TagCategory, SearchOptions, SearchResult } from './types.js';

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
  searchNodes(options: SearchOptions): Promise<SearchResult[]>;
  searchTrees(query: string): Promise<Tree[]>;

  // ── Tag category CRUD ──
  createCategory(category: TagCategory): Promise<void>;
  getCategory(categoryId: string): Promise<TagCategory>;
  listCategories(): Promise<TagCategory[]>;
  updateCategory(
    categoryId: string,
    fields: { name?: string; description?: string },
  ): Promise<void>;
  deleteCategory(categoryId: string): Promise<void>;

  // ── Tag CRUD ──
  createTag(tag: Tag): Promise<void>;
  getTag(tagId: string): Promise<Tag>;
  listTags(categoryId?: string): Promise<Tag[]>;
  updateTag(tagId: string, fields: { name?: string; description?: string }): Promise<void>;
  deleteTag(tagId: string): Promise<void>;

  // ── Tagging operations (idempotent) ──
  tagNode(nodeId: string, tagIds: string[]): Promise<void>;
  untagNode(nodeId: string, tagIds: string[]): Promise<void>;
  getNodeTags(nodeId: string): Promise<Tag[]>;
  tagTree(treeId: string, tagIds: string[]): Promise<void>;
  untagTree(treeId: string, tagIds: string[]): Promise<void>;
  getTreeTags(treeId: string): Promise<Tag[]>;

  // ── Tag-based queries (intersection semantics) ──
  findNodesByTags(tagIds: string[], options?: { treeId?: string }): Promise<Node[]>;
  findTreesByTags(tagIds: string[]): Promise<Tree[]>;
}
