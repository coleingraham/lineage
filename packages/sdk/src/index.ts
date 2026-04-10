import type {
  Node,
  Tree,
  Tag,
  TagCategory,
  NodeRepository,
  SearchOptions,
  SearchResult,
  SemanticSearchOptions,
  SemanticSearchResult,
} from '@lineage/core';

export { streamCompletion } from './streaming.js';
export type { StreamCompletionOptions } from './streaming.js';

export interface RestNodeRepositoryOptions {
  baseUrl: string;
}

export class RestNodeRepository implements NodeRepository {
  private readonly baseUrl: string;

  constructor(options: RestNodeRepositoryOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
  }

  async listTrees(): Promise<Tree[]> {
    const res = await fetch(`${this.baseUrl}/trees`);
    if (!res.ok) throw new Error(`listTrees failed: HTTP ${res.status}`);
    return res.json() as Promise<Tree[]>;
  }

  async getTree(treeId: string): Promise<Tree> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}`);
    if (!res.ok) throw new Error(`getTree failed: HTTP ${res.status}`);
    return res.json() as Promise<Tree>;
  }

  async putTree(tree: Tree): Promise<void> {
    // Try to fetch — if it exists, PATCH; otherwise POST
    const existing = await fetch(`${this.baseUrl}/trees/${tree.treeId}`);
    if (existing.ok) {
      const res = await fetch(`${this.baseUrl}/trees/${tree.treeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: tree.title, contextSources: tree.contextSources }),
      });
      if (!res.ok) throw new Error(`putTree (update) failed: HTTP ${res.status}`);
    } else {
      const res = await fetch(`${this.baseUrl}/trees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tree.title,
          treeId: tree.treeId,
          rootNodeId: tree.rootNodeId,
          contextSources: tree.contextSources,
        }),
      });
      if (!res.ok) throw new Error(`putTree (create) failed: HTTP ${res.status}`);
    }
  }

  async getNode(nodeId: string): Promise<Node> {
    // We need the treeId to construct the URL. Scan trees to find it.
    const trees = await this.listTrees();
    for (const tree of trees) {
      const res = await fetch(`${this.baseUrl}/trees/${tree.treeId}/nodes/${nodeId}`);
      if (res.ok) return res.json() as Promise<Node>;
    }
    throw new Error(`Node ${nodeId} not found`);
  }

  /** Fetch a node when the treeId is already known (avoids scanning all trees). */
  async getNodeInTree(treeId: string, nodeId: string): Promise<Node> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}/nodes/${nodeId}`);
    if (!res.ok) throw new Error(`getNodeInTree failed: HTTP ${res.status}`);
    return res.json() as Promise<Node>;
  }

  /** Update a node's content via PATCH. */
  async updateNode(treeId: string, nodeId: string, content: string): Promise<Node> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`updateNode failed: HTTP ${res.status}`);
    return res.json() as Promise<Node>;
  }

  /** Generate a title for a tree from the given content. Returns null on failure. */
  async generateTitle(treeId: string, content: string, model?: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}/generate-title`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, ...(model && { model }) }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return data.title ?? null;
  }

  async getNodes(treeId: string): Promise<Node[]> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}/nodes`);
    if (!res.ok) throw new Error(`getNodes failed: HTTP ${res.status}`);
    return res.json() as Promise<Node[]>;
  }

  async putNode(node: Node): Promise<void> {
    if (!node.parentId) {
      // Root nodes are created by the server when creating a tree — skip
      return;
    }
    const res = await fetch(`${this.baseUrl}/trees/${node.treeId}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId: node.nodeId,
        type: node.type,
        content: node.content,
        parentId: node.parentId,
      }),
    });
    if (!res.ok) throw new Error(`putNode failed: HTTP ${res.status}`);
  }

  async softDeleteNode(nodeId: string): Promise<void> {
    const node = await this.getNode(nodeId);
    const res = await fetch(`${this.baseUrl}/trees/${node.treeId}/nodes/${nodeId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`softDeleteNode failed: HTTP ${res.status}`);
  }

  async deleteTree(treeId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) throw new Error(`deleteTree failed: HTTP ${res.status}`);
  }

  async updateNodeEmbedding(): Promise<void> {
    // Not supported via REST yet
  }

  async semanticSearch(_options: SemanticSearchOptions): Promise<SemanticSearchResult[]> {
    // Not supported via REST yet
    return [];
  }

  async searchNodes(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: options.query });
    if (options.nodeTypes && options.nodeTypes.length > 0) {
      params.set('types', options.nodeTypes.join(','));
    }
    if (options.treeId) {
      params.set('treeId', options.treeId);
    }
    const res = await fetch(`${this.baseUrl}/search?${params}`);
    if (!res.ok) throw new Error(`searchNodes failed: HTTP ${res.status}`);
    const data = (await res.json()) as { nodes: SearchResult[] };
    return data.nodes;
  }

  async searchTrees(query: string): Promise<Tree[]> {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`${this.baseUrl}/search?${params}`);
    if (!res.ok) throw new Error(`searchTrees failed: HTTP ${res.status}`);
    const data = (await res.json()) as { trees: Tree[] };
    return data.trees;
  }

  // ── Tag category CRUD ──

  async createCategory(category: TagCategory): Promise<void> {
    const res = await fetch(`${this.baseUrl}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: category.name, description: category.description }),
    });
    if (!res.ok) throw new Error(`createCategory failed: HTTP ${res.status}`);
  }

  async getCategory(categoryId: string): Promise<TagCategory> {
    const res = await fetch(`${this.baseUrl}/categories/${categoryId}`);
    if (!res.ok) throw new Error(`getCategory failed: HTTP ${res.status}`);
    return res.json() as Promise<TagCategory>;
  }

  async listCategories(): Promise<TagCategory[]> {
    const res = await fetch(`${this.baseUrl}/categories`);
    if (!res.ok) throw new Error(`listCategories failed: HTTP ${res.status}`);
    return res.json() as Promise<TagCategory[]>;
  }

  async updateCategory(
    categoryId: string,
    fields: { name?: string; description?: string },
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/categories/${categoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(`updateCategory failed: HTTP ${res.status}`);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/categories/${categoryId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) throw new Error(`deleteCategory failed: HTTP ${res.status}`);
  }

  // ── Tag CRUD ──

  async createTag(tag: Tag): Promise<void> {
    const res = await fetch(`${this.baseUrl}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: tag.categoryId,
        name: tag.name,
        description: tag.description,
      }),
    });
    if (!res.ok) throw new Error(`createTag failed: HTTP ${res.status}`);
  }

  async getTag(tagId: string): Promise<Tag> {
    const res = await fetch(`${this.baseUrl}/tags/${tagId}`);
    if (!res.ok) throw new Error(`getTag failed: HTTP ${res.status}`);
    return res.json() as Promise<Tag>;
  }

  async listTags(categoryId?: string): Promise<Tag[]> {
    const params = new URLSearchParams();
    if (categoryId) params.set('categoryId', categoryId);
    const query = params.toString();
    const url = query ? `${this.baseUrl}/tags?${query}` : `${this.baseUrl}/tags`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`listTags failed: HTTP ${res.status}`);
    return res.json() as Promise<Tag[]>;
  }

  async updateTag(tagId: string, fields: { name?: string; description?: string }): Promise<void> {
    const res = await fetch(`${this.baseUrl}/tags/${tagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(`updateTag failed: HTTP ${res.status}`);
  }

  async deleteTag(tagId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/tags/${tagId}`, {
      method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) throw new Error(`deleteTag failed: HTTP ${res.status}`);
  }

  // ── Tagging operations ──

  async tagNode(nodeId: string, tagIds: string[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/nodes/${nodeId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    });
    if (!res.ok) throw new Error(`tagNode failed: HTTP ${res.status}`);
  }

  async untagNode(nodeId: string, tagIds: string[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/nodes/${nodeId}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    });
    if (!res.ok) throw new Error(`untagNode failed: HTTP ${res.status}`);
  }

  async getNodeTags(nodeId: string): Promise<Tag[]> {
    const res = await fetch(`${this.baseUrl}/nodes/${nodeId}/tags`);
    if (!res.ok) throw new Error(`getNodeTags failed: HTTP ${res.status}`);
    return res.json() as Promise<Tag[]>;
  }

  async tagTree(treeId: string, tagIds: string[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    });
    if (!res.ok) throw new Error(`tagTree failed: HTTP ${res.status}`);
  }

  async untagTree(treeId: string, tagIds: string[]): Promise<void> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds }),
    });
    if (!res.ok) throw new Error(`untagTree failed: HTTP ${res.status}`);
  }

  async getTreeTags(treeId: string): Promise<Tag[]> {
    const res = await fetch(`${this.baseUrl}/trees/${treeId}/tags`);
    if (!res.ok) throw new Error(`getTreeTags failed: HTTP ${res.status}`);
    return res.json() as Promise<Tag[]>;
  }

  // ── Tag-based queries ──

  async findNodesByTags(
    tagIds: string[],
    options?: { treeId?: string; matchAll?: boolean },
  ): Promise<Node[]> {
    const params = new URLSearchParams({
      tagIds: tagIds.join(','),
      scope: 'nodes',
    });
    if (options?.treeId) params.set('treeId', options.treeId);
    if (options?.matchAll === false) params.set('matchAll', 'false');
    const res = await fetch(`${this.baseUrl}/tags/search?${params}`);
    if (!res.ok) throw new Error(`findNodesByTags failed: HTTP ${res.status}`);
    const data = (await res.json()) as { nodes: Node[] };
    return data.nodes;
  }

  async findTreesByTags(tagIds: string[], options?: { matchAll?: boolean }): Promise<Tree[]> {
    const params = new URLSearchParams({
      tagIds: tagIds.join(','),
      scope: 'trees',
    });
    if (options?.matchAll === false) params.set('matchAll', 'false');
    const res = await fetch(`${this.baseUrl}/tags/search?${params}`);
    if (!res.ok) throw new Error(`findTreesByTags failed: HTTP ${res.status}`);
    const data = (await res.json()) as { trees: Tree[] };
    return data.trees;
  }
}
