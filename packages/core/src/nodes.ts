import type { BranchIntent, Node, NodeType } from './types.js';

/**
 * Metadata key holding a node's full parent set when it has more than one
 * parent (a "merge node"). The array includes the primary `parentId` and is
 * deduped by {@link parentIdsOf}. Stored in `metadata` so it round-trips
 * through every adapter without a schema change.
 */
export const MERGE_PARENT_IDS_KEY = 'mergeParentIds';

/**
 * The full parent set of a node: the primary `parentId` first, then any
 * additional parents recorded in `metadata.mergeParentIds`, deduped. Returns an
 * empty array for a parentless root with no merge parents.
 *
 * This is the single source of truth for "who are this node's parents" — both
 * the spine (single `parentId`) and in-tree merge edges (multiple incoming
 * edges) flow through it.
 */
export function parentIdsOf(node: Node): string[] {
  const ids: string[] = [];
  if (node.parentId) ids.push(node.parentId);
  const raw = node.metadata?.[MERGE_PARENT_IDS_KEY];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

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
  intent?: BranchIntent | null;
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
    intent: fields.intent ?? null,
  };
}
