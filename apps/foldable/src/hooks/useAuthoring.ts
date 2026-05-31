import { useCallback, useMemo } from 'react';
import type { BranchIntent, NodeRepository, Tree } from '@lineage/core';
import { BRANCH_INTENTS, createNode } from '@lineage/core';
import { getAuthorId } from '../lib/authorId.js';

export interface Authoring {
  /** Create a new monologue tree seeded with a root thought. */
  createTree: (title: string, rootContent: string) => Promise<{ treeId: string; rootNodeId: string }>;
  /** Append a sequential continuation to the active line. Returns the new node id. */
  append: (treeId: string, parentId: string, content: string) => Promise<string>;
  /** Fork a divergence off a node with an explicit branch intent. Returns the new node id. */
  diverge: (
    treeId: string,
    parentId: string,
    content: string,
    intent: BranchIntent,
  ) => Promise<string>;
  /** Edit a node's content in place. */
  edit: (nodeId: string, content: string) => Promise<void>;
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
    async (title, rootContent) => {
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
        contextSources: null,
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
      await repo.putNode({ ...node, content });
      onChanged();
    },
    [repo, onChanged],
  );

  const remove = useCallback<Authoring['remove']>(
    async (nodeId) => {
      if (!repo) throw new Error('Repository not ready');
      await repo.softDeleteNode(nodeId);
      onChanged();
    },
    [repo, onChanged],
  );

  return { createTree, append, diverge, edit, remove };
}
