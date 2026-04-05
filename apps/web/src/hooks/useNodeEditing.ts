import { useState, useCallback, useEffect } from 'react';
import type { GraphNode } from '../components/graph/GraphRendererTypes.js';

interface UseNodeEditingOptions {
  nodeById: Map<string, GraphNode>;
  onEdit: (nodeId: string, content: string) => Promise<void>;
  onNodeReply: (nodeId: string) => void;
  pendingEditNodeId: string | null;
  onPendingEditHandled: () => void;
  focusNodeId: string | null;
  onFocusHandled: () => void;
  /** Initial value for selectedNodeId. */
  initialSelectedNodeId?: string | null;
  /** Called when a node is focused, before onFocusHandled. */
  onFocus?: (nodeId: string) => void;
}

export function useNodeEditing({
  nodeById,
  onEdit,
  onNodeReply,
  pendingEditNodeId,
  onPendingEditHandled,
  focusNodeId,
  onFocusHandled,
  initialSelectedNodeId,
  onFocus,
}: UseNodeEditingOptions) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialSelectedNodeId ?? null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleEditStart = useCallback((nodeId: string, content: string) => {
    setEditingNodeId(nodeId);
    setEditText(content);
  }, []);

  const handleEditSave = useCallback(async () => {
    if (editingNodeId) {
      const nodeId = editingNodeId;
      const node = nodeById.get(nodeId);
      await onEdit(nodeId, editText);
      setEditingNodeId(null);
      setEditText('');
      if (node?.type === 'human') {
        onNodeReply(nodeId);
      }
    }
  }, [editingNodeId, editText, onEdit, nodeById, onNodeReply]);

  const handleEditCancel = useCallback(() => {
    setEditingNodeId(null);
    setEditText('');
  }, []);

  // Auto-trigger edit for pending node (e.g. new conversation root)
  useEffect(() => {
    if (pendingEditNodeId && nodeById.has(pendingEditNodeId)) {
      setSelectedNodeId(pendingEditNodeId);
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
