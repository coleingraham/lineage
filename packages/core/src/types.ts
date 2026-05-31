/**
 * Open string type for node roles — extensible without core changes.
 * Use {@link NODE_TYPES} constants for well-known values.
 */
export type NodeType = string;

/** Well-known node type constants. */
export const NODE_TYPES = {
  HUMAN: 'human',
  AI: 'ai',
  SYSTEM: 'system',
  SUMMARY: 'summary',
  TOOL_CALL: 'tool_call',
  TOOL_RESULT: 'tool_result',
} as const;

export interface Node {
  nodeId: string;
  treeId: string;
  parentId: string | null;
  type: NodeType;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  modelName: string | null;
  provider: string | null;
  tokenCount: number | null;
  embeddingModel: string | null;
  /** Arbitrary key-value data (agentic memory, tool params, tags, etc.). */
  metadata: Record<string, unknown> | null;
  /** Identifier for the author (userId, agent name, etc.) in multi-user scenarios. */
  author: string | null;
}

export interface ContextSource {
  treeId: string;
  nodeId: string;
}

/**
 * A live, off-spine reference between two points in the lineage graph,
 * keyed by `(tree_id, node_id)` on both ends.
 *
 * This is the single primitive underlying the three places we record
 * cross-tree pointers: `context_sources` on a tree (the tree-owned case,
 * `fromNodeId === null`), fork provenance, and synthesis soft-links.
 *
 * INVARIANT: a `CrossTreeRef` must **never** be traversed during context
 * assembly. Context is reconstructed by walking hard parent edges to the
 * root; a hard edge cannot cross a tree boundary. A `CrossTreeRef` is a soft
 * reference that may cross trees freely and must not enter any node's context.
 */
export interface CrossTreeRef {
  /** Owning tree of the reference. */
  fromTreeId: string;
  /** Owning node, or `null` when the reference is tree-owned (e.g. context_sources). */
  fromNodeId: string | null;
  /** Referenced tree. */
  toTreeId: string;
  /** Referenced node. */
  toNodeId: string;
  /** Storage-only label, e.g. `context_source` | `fork_provenance` | `synthesis_link`. */
  kind: string;
  /** Whether the reference is live (resolved on read). Defaults to true. */
  live: boolean;
}

/** Well-known {@link CrossTreeRef} kinds. */
export const CROSS_TREE_REF_KINDS = {
  CONTEXT_SOURCE: 'context_source',
  FORK_PROVENANCE: 'fork_provenance',
  SYNTHESIS_LINK: 'synthesis_link',
} as const;

/** Filter for querying/deleting cross-tree references. */
export interface CrossTreeRefQuery {
  fromTreeId?: string;
  /** Match a specific owner node, or `null` to match tree-owned refs. */
  fromNodeId?: string | null;
  toTreeId?: string;
  toNodeId?: string;
  kind?: string;
}

export interface Tree {
  treeId: string;
  title: string;
  createdAt: string;
  rootNodeId: string;
  contextSources: ContextSource[] | null;
}

export interface SearchOptions {
  query: string;
  nodeTypes?: string[];
  treeId?: string;
  includeDeleted?: boolean;
}

export interface SearchResult {
  node: Node;
  treeTitle: string;
}

export interface SemanticSearchOptions {
  embedding: number[];
  treeId: string;
  limit?: number;
}

export interface SemanticSearchResult {
  node: Node;
  score: number;
}

export interface TagCategory {
  categoryId: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Tag {
  tagId: string;
  categoryId: string;
  name: string;
  description: string;
  createdAt: string;
}
