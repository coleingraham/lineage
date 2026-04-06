import type { Node, NodeType } from './types.js';

export interface CreateNodeFields {
  treeId: string;
  parentId: string | null;
  type: NodeType;
  content: string;
  nodeId?: string;
  modelName?: string | null;
  provider?: string | null;
  tokenCount?: number | null;
  embeddingModel?: string | null;
  metadata?: Record<string, unknown> | null;
  author?: string | null;
}

/**
 * Create a new {@link Node} with sensible defaults.
 *
 * Only `treeId`, `parentId`, `type`, and `content` are required.
 * Generates a random `nodeId` and `createdAt` timestamp automatically.
 */
export function createNode(fields: CreateNodeFields): Node {
  return {
    nodeId: fields.nodeId ?? crypto.randomUUID(),
    treeId: fields.treeId,
    parentId: fields.parentId,
    type: fields.type,
    content: fields.content,
    isDeleted: false,
    createdAt: new Date().toISOString(),
    modelName: fields.modelName ?? null,
    provider: fields.provider ?? null,
    tokenCount: fields.tokenCount ?? null,
    embeddingModel: fields.embeddingModel ?? null,
    metadata: fields.metadata ?? null,
    author: fields.author ?? null,
  };
}
