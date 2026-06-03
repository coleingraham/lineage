/**
 * The projection primitive (see `projection-primitive.md`, THO-64).
 *
 * A projection generalizes every cross-tree content operation into one shape:
 *
 *     project(sourceSelection, transform, attachmentPoint)
 *       -> new content on the destination context spine
 *        + a live CrossTreeRef recorded off-spine
 *
 * The four parts:
 *  - **selection** — a node-set (a connected subtree is the special case)
 *  - **transform** — `node_set -> node(s)`; owns its emit strategy
 *  - **attachment point** — any node in any tree
 *  - **provenance** — a live {@link CrossTreeRef}, recorded off-spine, never
 *    traversed during context assembly
 *
 * `fork` and `seeding` are two transforms over this one operation. This module
 * has no runtime dependencies; transforms perform their I/O through the
 * injected {@link NodeRepository}, mirroring `context.ts`.
 */
import type { CrossTreeRef, Node } from './types.js';
import { CROSS_TREE_REF_KINDS, NODE_TYPES } from './types.js';
import type { NodeRepository } from './repository.js';

/** A set of source nodes to project. May span trees and need not be contiguous. */
export interface SourceSelection {
  nodes: Node[];
}

/** Where a projection's emitted content attaches: a node in some tree. */
export interface AttachmentPoint {
  treeId: string;
  /** The node the emitted content hangs from (its parent). */
  parentNodeId: string;
}

/** What a transform produced: nodes written to the destination + provenance refs. */
export interface ProjectionResult {
  /** Nodes emitted (and persisted) onto the destination spine. */
  emittedNodes: Node[];
  /** Off-spine provenance references recorded for this projection. */
  refs: CrossTreeRef[];
}

/** Injected context a transform runs against. */
export interface TransformContext {
  repo: NodeRepository;
  source: SourceSelection;
  attachment: AttachmentPoint;
  /** ID generator for new nodes (kept injectable so core stays dependency-free). */
  newId: () => string;
  /** Timestamp generator (ISO string). */
  now: () => string;
}

/**
 * A transform maps a source node-set into emitted node(s) at the attachment
 * point and records provenance. It owns its emit strategy.
 */
export interface Transform {
  readonly name: string;
  apply(ctx: TransformContext): Promise<ProjectionResult>;
}

/**
 * Run a projection: apply `transform` to `selection`, emitting onto the spine
 * at `attachment` and recording provenance via the repository.
 *
 * This is a thin orchestrator — the transform does the real work and decides
 * what to emit and which refs to record. `project` persists the refs.
 */
export async function project(
  repo: NodeRepository,
  selection: SourceSelection,
  transform: Transform,
  attachment: AttachmentPoint,
  options: { newId: () => string; now: () => string },
): Promise<ProjectionResult> {
  const result = await transform.apply({
    repo,
    source: selection,
    attachment,
    newId: options.newId,
    now: options.now,
  });
  for (const ref of result.refs) {
    await repo.putCrossTreeRef(ref);
  }
  return result;
}

/**
 * The **verbatim-preserve** transform (THO-46 fork): deep-copy the connected
 * source subtree into the destination tree, preserving shape, and attach it at
 * the attachment point. Records live `fork_provenance` refs.
 *
 * Node IDs are remapped so the copies are fully owned by the destination tree.
 * The source set must be connected; the node whose parent is not in the set is
 * treated as the subtree root and re-parented onto the attachment point.
 */
export const forkTransform: Transform = {
  name: 'fork',
  async apply({ repo, source, attachment, newId, now }): Promise<ProjectionResult> {
    const sourceNodes = source.nodes;
    if (sourceNodes.length === 0) {
      return { emittedNodes: [], refs: [] };
    }

    const sourceIds = new Set(sourceNodes.map((n) => n.nodeId));
    // Roots of the selection: nodes whose parent is outside the selection.
    const roots = sourceNodes.filter((n) => n.parentId === null || !sourceIds.has(n.parentId));

    // Remap every source node id to a fresh destination id.
    const idMap = new Map<string, string>();
    for (const n of sourceNodes) {
      idMap.set(n.nodeId, newId());
    }

    const createdAt = now();
    const emittedNodes: Node[] = [];
    const refs: CrossTreeRef[] = [];

    for (const original of sourceNodes) {
      const isRoot = roots.includes(original);
      const remappedParent =
        original.parentId && sourceIds.has(original.parentId)
          ? idMap.get(original.parentId)!
          : null;
      const copy: Node = {
        ...original,
        nodeId: idMap.get(original.nodeId)!,
        treeId: attachment.treeId,
        // Subtree roots re-parent onto the attachment point; interior nodes
        // keep their (remapped) parent so the shape is preserved.
        parentId: isRoot ? attachment.parentNodeId : remappedParent,
        createdAt,
      };
      await repo.putNode(copy);
      emittedNodes.push(copy);
      // Live provenance from the copy back to its origin.
      refs.push({
        fromTreeId: attachment.treeId,
        fromNodeId: copy.nodeId,
        toTreeId: original.treeId,
        toNodeId: original.nodeId,
        kind: CROSS_TREE_REF_KINDS.FORK_PROVENANCE,
        live: true,
      });
    }

    return { emittedNodes, refs };
  },
};

/**
 * The **synthesis** transform (THO synthesis-nodes-with-soft-links model):
 * emit a single new node whose content is a caller-provided synthesis of the
 * source node-set, attached at the attachment point, and record one live
 * `synthesis_link` ref from the new node back to each source.
 *
 * Unlike {@link forkTransform}, this does NOT copy the sources — it references
 * them off-spine, so context assembly never traverses into them. The synthesis
 * text is supplied by the caller (the model), so this is a factory returning a
 * {@link Transform} bound to that text rather than a singleton.
 */
export function synthesisTransform(options: { synthesis: string; label?: string }): Transform {
  return {
    name: 'synthesis',
    async apply({ repo, source, attachment, newId, now }): Promise<ProjectionResult> {
      const createdAt = now();
      const synthNode: Node = {
        nodeId: newId(),
        treeId: attachment.treeId,
        parentId: attachment.parentNodeId,
        type: NODE_TYPES.AI,
        content: options.synthesis,
        isDeleted: false,
        createdAt,
        modelName: null,
        provider: null,
        tokenCount: null,
        embeddingModel: null,
        metadata: options.label !== undefined ? { label: options.label } : null,
        author: null,
        intent: null,
      };
      await repo.putNode(synthNode);

      // One live synthesis_link from the new node to each (deduped) source.
      const seen = new Set<string>();
      const refs: CrossTreeRef[] = [];
      for (const src of source.nodes) {
        const key = `${src.treeId}:${src.nodeId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({
          fromTreeId: attachment.treeId,
          fromNodeId: synthNode.nodeId,
          toTreeId: src.treeId,
          toNodeId: src.nodeId,
          kind: CROSS_TREE_REF_KINDS.SYNTHESIS_LINK,
          live: true,
        });
      }

      return { emittedNodes: [synthNode], refs };
    },
  };
}
