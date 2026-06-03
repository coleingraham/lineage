import { useCallback, useMemo } from 'react';
import type { BranchIntent, ContextSource, NodeRepository, Tree } from '@lineage/core';
import { BRANCH_INTENTS, MERGE_PARENT_IDS_KEY, NODE_TYPES, createNode } from '@lineage/core';
import { getAuthorId } from '../lib/authorId.js';

export interface Authoring {
  /** Create a new monologue tree seeded with a root thought, optionally with
   * cross-tree context sources (pinned nodes injected as background). */
  createTree: (
    title: string,
    rootContent: string,
    contextSources?: ContextSource[],
  ) => Promise<{ treeId: string; rootNodeId: string }>;
  /** Append a sequential continuation to the active line. Returns the new node id. */
  append: (treeId: string, parentId: string, content: string) => Promise<string>;
  /** Fork a divergence off a node with an explicit branch intent. Returns the new node id. */
  diverge: (
    treeId: string,
    parentId: string,
    content: string,
    intent: BranchIntent,
  ) => Promise<string>;
  /**
   * Revise a node non-destructively: create a **sibling** (same parent + intent)
   * carrying the new content, preserving the original as a separate version.
   * The root has no parent to branch from, so it is revised in place. Returns
   * the id of the node to focus (the new sibling, or the root).
   */
  edit: (nodeId: string, content: string) => Promise<string>;
  /** Attach an AI-generated summary node (type `summary`) under a node. */
  summarize: (treeId: string, parentId: string, content: string) => Promise<string>;
  /**
   * Create an in-tree merge node whose parents are the given summary nodes
   * (multiple incoming edges). The first id is the primary `parentId`; the full
   * set is stored in `metadata.mergeParentIds`. Returns the new node id.
   */
  mergeNode: (treeId: string, summaryIds: string[], content?: string) => Promise<string>;
  /** Attach an AI-generated response node (type `ai`) under a node. */
  aiReply: (treeId: string, parentId: string, content: string) => Promise<string>;
  /** Soft-delete a node. */
  remove: (nodeId: string) => Promise<void>;
}

/**
 * Manual monologue authoring (D1) over the repository — no AI. Sequential
 * continuations carry the `sequence` intent; divergences carry an explicit
 * branch intent chosen by the author. Every mutation calls `onChanged` so the
 * caller can refresh.
 */
export function useAuthoring(repo: NodeRepository | null, onChanged: () => void): Authoring {
  const author = useMemo(() => getAuthorId(), []);

  const createTree = useCallback<Authoring['createTree']>(
    async (title, rootContent, contextSources) => {
      if (!repo) throw new Error('Repository not ready');
      const treeId = crypto.randomUUID();
      const root = createNode({
        treeId,
        parentId: null,
        type: 'human',
        content: rootContent,
        author,
        intent: null,
      });
      const tree: Tree = {
        treeId,
        title: title.trim() || 'Untitled monologue',
        createdAt: new Date().toISOString(),
        rootNodeId: root.nodeId,
        contextSources: contextSources && contextSources.length > 0 ? contextSources : null,
      };
      await repo.putTree(tree);
      await repo.putNode(root);
      onChanged();
      return { treeId, rootNodeId: root.nodeId };
    },
    [repo, author, onChanged],
  );

  const append = useCallback<Authoring['append']>(
    async (treeId, parentId, content) => {
      if (!repo) throw new Error('Repository not ready');
      const node = createNode({
        treeId,
        parentId,
        type: 'human',
        content,
        author,
        intent: BRANCH_INTENTS.SEQUENCE,
      });
      await repo.putNode(node);
      onChanged();
      return node.nodeId;
    },
    [repo, author, onChanged],
  );

  const diverge = useCallback<Authoring['diverge']>(
    async (treeId, parentId, content, intent) => {
      if (!repo) throw new Error('Repository not ready');
      const node = createNode({ treeId, parentId, type: 'human', content, author, intent });
      await repo.putNode(node);
      onChanged();
      return node.nodeId;
    },
    [repo, author, onChanged],
  );

  const edit = useCallback<Authoring['edit']>(
    async (nodeId, content) => {
      if (!repo) throw new Error('Repository not ready');
      const node = await repo.getNode(nodeId);
      if (node.parentId === null) {
        // Root has no parent to branch a sibling from — revise it in place.
        await repo.putNode({ ...node, content });
        onChanged();
        return node.nodeId;
      }
      // Non-destructive: the revision is a new sibling; the original is kept.
      const sibling = createNode({
        treeId: node.treeId,
        parentId: node.parentId,
        type: node.type,
        content,
        author,
        intent: node.intent,
      });
      await repo.putNode(sibling);
      onChanged();
      return sibling.nodeId;
    },
    [repo, author, onChanged],
  );

  const summarize = useCallback<Authoring['summarize']>(
    async (treeId, parentId, content) => {
      if (!repo) throw new Error('Repository not ready');
      const node = createNode({
        treeId,
        parentId,
        type: NODE_TYPES.SUMMARY,
        content,
        intent: null,
      });
      await repo.putNode(node);
      onChanged();
      return node.nodeId;
    },
    [repo, onChanged],
  );

  const aiReply = useCallback<Authoring['aiReply']>(
    async (treeId, parentId, content) => {
      if (!repo) throw new Error('Repository not ready');
      const node = createNode({
        treeId,
        parentId,
        type: NODE_TYPES.AI,
        content,
        provider: 'aicore',
        modelName: 'gemini-nano',
        intent: null,
      });
      await repo.putNode(node);
      onChanged();
      return node.nodeId;
    },
    [repo, onChanged],
  );

  const mergeNode = useCallback<Authoring['mergeNode']>(
    async (treeId, summaryIds, content = '') => {
      if (!repo) throw new Error('Repository not ready');
      if (summaryIds.length === 0) throw new Error('A merge node needs at least one parent');
      const node = createNode({
        treeId,
        parentId: summaryIds[0],
        type: NODE_TYPES.HUMAN,
        content,
        author,
        intent: null,
        metadata: { [MERGE_PARENT_IDS_KEY]: summaryIds },
      });
      await repo.putNode(node);
      onChanged();
      return node.nodeId;
    },
    [repo, author, onChanged],
  );

  const remove = useCallback<Authoring['remove']>(
    async (nodeId) => {
      if (!repo) throw new Error('Repository not ready');
      await repo.softDeleteNode(nodeId);
      onChanged();
    },
    [repo, onChanged],
  );

  return { createTree, append, diverge, edit, summarize, aiReply, mergeNode, remove };
}
