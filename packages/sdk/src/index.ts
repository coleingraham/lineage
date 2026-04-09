import type { Node, Tree, NodeRepository, SearchOptions, SearchResult } from '@lineage/core';

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
}
