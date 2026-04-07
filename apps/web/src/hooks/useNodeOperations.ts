import { useCallback } from 'react';
import type { Node, NodeRepository, Tree } from '@lineage/core';
import { createNode } from '@lineage/core';
import type { RestNodeRepository } from '@lineage/sdk';

interface UseNodeOperationsOptions {
  repo: NodeRepository | null;
  selectedTreeId: string | null;
  nodes: Node[];
  trees: Tree[];
  refresh: () => void;
  setSelectedTreeId: (id: string | null) => void;
  setPendingEditNodeId: (id: string | null) => void;
}

export function useNodeOperations({
  repo,
  selectedTreeId,
  nodes,
  trees,
  refresh,
  setSelectedTreeId,
  setPendingEditNodeId,
}: UseNodeOperationsOptions) {
  const handleDelete = useCallback(
    async (nodeId: string) => {
      if (!repo) return;
      try {
        await repo.softDeleteNode(nodeId);
        refresh();
      } catch (e) {
        console.error('[App] delete failed', e);
      }
    },
    [repo, refresh],
  );

  const handleDeleteTree = useCallback(
    async (treeId: string) => {
      if (!repo) return;
      try {
        await repo.deleteTree(treeId);
        if (treeId === selectedTreeId) {
          setSelectedTreeId(null);
        }
        refresh();
      } catch (e) {
        console.error('[App] delete tree failed', e);
      }
    },
    [repo, selectedTreeId, refresh, setSelectedTreeId],
  );

  const generateTitle = useCallback(
    async (treeId: string, content: string) => {
      if (!repo) return;
      // Use SDK generateTitle if available (RestNodeRepository), otherwise skip
      const sdk = repo as RestNodeRepository & {
        generateTitle?: (treeId: string, content: string, model?: string) => Promise<string | null>;
      };
      if (typeof sdk.generateTitle !== 'function') {
        // Fallback: try via localStorage serverUrl
        const serverUrl = localStorage.getItem('lineage:serverUrl');
        if (!serverUrl) return;
        const model = localStorage.getItem('lineage:llmModel') || undefined;
        try {
          const res = await fetch(`${serverUrl}/trees/${treeId}/generate-title`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, ...(model && { model }) }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { title?: string };
          if (data.title) {
            const tree = trees.find((t) => t.treeId === treeId);
            if (tree) {
              await repo.putTree({ ...tree, title: data.title });
              refresh();
            }
          }
        } catch (e) {
          console.error('[App] title generation failed', e);
        }
        return;
      }
      const model = localStorage.getItem('lineage:llmModel') || undefined;
      try {
        const title = await sdk.generateTitle(treeId, content, model);
        if (title) {
          const tree = trees.find((t) => t.treeId === treeId);
          if (tree) {
            await repo.putTree({ ...tree, title });
            refresh();
          }
        }
      } catch (e) {
        console.error('[App] title generation failed', e);
      }
    },
    [repo, trees, refresh],
  );

  const handleRootNodeSubmitted = useCallback(
    (content: string) => {
      if (selectedTreeId && content.trim()) {
        generateTitle(selectedTreeId, content);
      }
    },
    [selectedTreeId, generateTitle],
  );

  const handleEdit = useCallback(
    async (nodeId: string, content: string) => {
      if (!repo || !selectedTreeId) return;
      try {
        // Use SDK updateNode if available, otherwise fallback
        const sdk = repo as RestNodeRepository & {
          updateNode?: (treeId: string, nodeId: string, content: string) => Promise<Node>;
        };
        if (typeof sdk.updateNode === 'function') {
          await sdk.updateNode(selectedTreeId, nodeId, content);
        } else {
          const serverUrl = localStorage.getItem('lineage:serverUrl');
          if (serverUrl) {
            const res = await fetch(`${serverUrl}/trees/${selectedTreeId}/nodes/${nodeId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content }),
            });
            if (!res.ok) throw new Error(`PATCH failed: HTTP ${res.status}`);
          } else {
            const existing = await repo.getNode(nodeId);
            await repo.putNode({ ...existing, content });
          }
        }
        refresh();
      } catch (e) {
        console.error('[App] edit failed', e);
      }
    },
    [repo, selectedTreeId, refresh],
  );

  const handleCreateSibling = useCallback(
    async (originalNodeId: string, content: string): Promise<string | null> => {
      if (!repo || !selectedTreeId) return null;
      const original = nodes.find((n) => n.nodeId === originalNodeId);
      if (!original || !original.parentId) return null;
      try {
        const node = createNode({
          treeId: selectedTreeId,
          parentId: original.parentId,
          type: 'human',
          content,
        });
        await repo.putNode(node);
        refresh();
        return node.nodeId;
      } catch (e) {
        console.error('[App] create sibling failed', e);
        return null;
      }
    },
    [repo, selectedTreeId, nodes, refresh],
  );

  const handleCompose = useCallback(
    async (parentNodeId: string, content: string) => {
      if (!repo || !selectedTreeId) return;
      try {
        const node = createNode({
          treeId: selectedTreeId,
          parentId: parentNodeId,
          type: 'human',
          content,
        });
        await repo.putNode(node);
        refresh();
      } catch (e) {
        console.error('[App] compose failed', e);
      }
    },
    [repo, selectedTreeId, refresh],
  );

  const handleAddHumanNode = useCallback(
    async (parentNodeId: string) => {
      if (!repo || !selectedTreeId) return;
      try {
        const node = createNode({
          treeId: selectedTreeId,
          parentId: parentNodeId,
          type: 'human',
          content: '',
        });
        await repo.putNode(node);
        refresh();
        setPendingEditNodeId(node.nodeId);
      } catch (e) {
        console.error('[App] add human node failed', e);
      }
    },
    [repo, selectedTreeId, refresh, setPendingEditNodeId],
  );

  return {
    handleDelete,
    handleDeleteTree,
    handleEdit,
    handleCreateSibling,
    handleCompose,
    handleAddHumanNode,
    handleRootNodeSubmitted,
  };
}
