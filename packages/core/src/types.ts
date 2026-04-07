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

export interface Tree {
  treeId: string;
  title: string;
  createdAt: string;
  rootNodeId: string;
}
