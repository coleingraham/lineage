import { useState, useCallback, useEffect } from 'react';
import type { GraphNode } from '../components/graph/GraphRendererTypes.js';

interface UseNodeEditingOptions {
  nodeById: Map<string, GraphNode>;
  onEdit: (nodeId: string, content: string) => Promise<void>;
  onCreateSibling: (originalNodeId: string, content: string) => Promise<string | null>;
  onDelete: (nodeId: string) => void;
  onDeleteTree: (treeId: string) => void;
  selectedTreeId: string | null;
  onNodeReply: (nodeId: string) => void;
  onRootNodeSubmitted?: (content: string) => void;
  pendingEditNodeId: string | null;
  onPendingEditHandled: () => void;
  focusNodeId: string | null;
  onFocusHandled: () => void;
  /** Initial value for selectedNodeId. */
  initialSelectedNodeId?: string | null;
  /** Called whenever selectedNodeId changes. */
  onSelectedNodeChange?: (nodeId: string) => void;
  /** Called when a node is focused, before onFocusHandled. */
  onFocus?: (nodeId: string) => void;
  /** Whether saving a human node edit should auto-trigger AI reply. */
  autoAiReply?: boolean;
}

export function useNodeEditing({
  nodeById,
  onEdit,
  onCreateSibling,
  onDelete,
  onDeleteTree,
  selectedTreeId,
  onNodeReply,
  onRootNodeSubmitted,
  pendingEditNodeId,
  onPendingEditHandled,
  focusNodeId,
  onFocusHandled,
  initialSelectedNodeId,
  onSelectedNodeChange,
  onFocus,
  autoAiReply = true,
}: UseNodeEditingOptions) {
  const [selectedNodeId, _setSelectedNodeId] = useState<string | null>(
    initialSelectedNodeId ?? null,
  );
  const setSelectedNodeId = useCallback(
    (id: string | null) => {
      _setSelectedNodeId(id);
      if (id) onSelectedNodeChange?.(id);
    },
    [onSelectedNodeChange],
  );
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // Tracks nodes created eagerly (e.g. handleAddHumanNode) that should be
  // deleted if the user cancels before submitting content.
  const [pendingNewNodeId, setPendingNewNodeId] = useState<string | null>(null);

  const handleEditStart = useCallback((nodeId: string, content: string) => {
    setEditingNodeId(nodeId);
    setEditText(content);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (editingNodeId) {
      const nodeId = editingNodeId;
      const node = nodeById.get(nodeId);
      const isPendingNew = pendingNewNodeId === nodeId;
      setEditingNodeId(null);
      setEditText('');
      setPendingNewNodeId(null);
      if (node?.type === 'human') {
        if (isPendingNew) {
          // Node was eagerly created (e.g. handleAddHumanNode) — update in place
          await onEdit(nodeId, editText);
          if (autoAiReply) onNodeReply(nodeId);
          if (!node.parentId) onRootNodeSubmitted?.(editText);
        } else if (!node.parentId) {
          // Root node — can't create sibling, edit in place
          await onEdit(nodeId, editText);
          if (autoAiReply) onNodeReply(nodeId);
          onRootNodeSubmitted?.(editText);
        } else {
          const newNodeId = await onCreateSibling(nodeId, editText);
          if (newNodeId) {
            setSelectedNodeId(newNodeId);
            if (autoAiReply) onNodeReply(newNodeId);
          }
        }
      } else {
        await onEdit(nodeId, editText);
      }
    }
  }, [
    editingNodeId,
    editText,
    pendingNewNodeId,
    onEdit,
    onCreateSibling,
    nodeById,
    onNodeReply,
    onRootNodeSubmitted,
    setSelectedNodeId,
    autoAiReply,
  ]);

  const handleEditCancel = useCallback(() => {
    if (pendingNewNodeId) {
      const node = nodeById.get(pendingNewNodeId);
      const parentId = node?.parentId ?? null;
      if (!parentId && selectedTreeId) {
        // Canceling the root node of a new conversation — remove the entire tree
        onDeleteTree(selectedTreeId);
      } else {
        onDelete(pendingNewNodeId);
        if (parentId) setSelectedNodeId(parentId);
      }
      setPendingNewNodeId(null);
    }
    setEditingNodeId(null);
    setEditText('');
  }, [pendingNewNodeId, onDelete, onDeleteTree, selectedTreeId, nodeById, setSelectedNodeId]);

  // Sync internal selection when parent changes it (e.g. tree switch)
  useEffect(() => {
    _setSelectedNodeId(initialSelectedNodeId ?? null);
  }, [initialSelectedNodeId]);

  // Auto-trigger edit for pending node (e.g. new conversation root or add human node)
  useEffect(() => {
    if (pendingEditNodeId && nodeById.has(pendingEditNodeId)) {
      setSelectedNodeId(pendingEditNodeId);
      setPendingNewNodeId(pendingEditNodeId);
      handleEditStart(pendingEditNodeId, nodeById.get(pendingEditNodeId)!.content);
      onPendingEditHandled();
    }
  }, [pendingEditNodeId, nodeById, handleEditStart, onPendingEditHandled]);

  // Focus newly created node after streaming completes
  useEffect(() => {
    if (focusNodeId && nodeById.has(focusNodeId)) {
      setSelectedNodeId(focusNodeId);
      onFocus?.(focusNodeId);
      onFocusHandled();
    }
  }, [focusNodeId, nodeById, onFocusHandled, onFocus]);

  return {
    selectedNodeId,
    setSelectedNodeId,
    editingNodeId,
    editText,
    setEditText,
    handleEditStart,
    handleEditSave,
    handleEditCancel,
  };
}
