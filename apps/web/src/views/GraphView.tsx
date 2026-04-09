import { useMemo } from 'react';
import type { Node, Tree, NodeRepository } from '@lineage/core';
import { COLORS } from '../styles/theme.js';
import { GraphRenderer } from '../components/GraphRenderer.js';
import type {
  GraphCallbacks,
  SidebarMode,
  PinnedNode,
} from '../components/graph/GraphRendererTypes.js';
import { toGraphNodes } from '../components/graph/convertNodes.js';
import { Sidebar } from '../components/graph/Sidebar.js';
import { useStreamingStore } from '../store/streaming.js';
import { useStreamingCallbacks } from '../store/useStreamingCallbacks.js';
import { useNodeEditing } from '../hooks/useNodeEditing.js';

interface GraphViewProps {
  nodes: Node[];
  treeId: string;
  onDelete: (nodeId: string) => void;
  onEdit: (nodeId: string, content: string) => Promise<void>;
  onCompose: (parentNodeId: string, content: string) => Promise<void>;
  onAddHumanNode: (parentNodeId: string) => Promise<void>;
  onCreateSibling: (originalNodeId: string, content: string) => Promise<string | null>;
  selectedNodeId: string | null;
  onSelectedNodeChange: (nodeId: string) => void;
  focusNodeId: string | null;
  onFocusHandled: () => void;
  trees: Tree[];
  selectedTreeId: string | null;
  onSelectTree: (treeId: string) => void;
  onDeleteTree: (treeId: string) => void;
  repo: NodeRepository;
  onTreeCreated: () => void;
  onRequestEdit: (nodeId: string) => void;
  pendingEditNodeId: string | null;
  onPendingEditHandled: () => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  onRootNodeSubmitted: (content: string) => void;
  pinnedNodes: PinnedNode[];
  onTogglePin: (nodeId: string) => void;
  onUnpin: (nodeId: string) => void;
  onClearAllPins: () => void;
  selectedPinNodeIds: Set<string>;
  onPinSelectionChange: (ids: Set<string>) => void;
  onCreateTreeFromContext: () => Promise<void>;
  onNavigateToNode: (treeId: string, nodeId: string) => void;
  autoAiReply?: boolean;
}

export function GraphView({
  nodes,
  treeId,
  onDelete,
  onEdit,
  onAddHumanNode,
  onCreateSibling,
  selectedNodeId: controlledSelectedNodeId,
  onSelectedNodeChange,
  focusNodeId,
  onFocusHandled,
  trees,
  selectedTreeId,
  onSelectTree,
  onDeleteTree,
  repo,
  onTreeCreated,
  onRequestEdit,
  pendingEditNodeId,
  onPendingEditHandled,
  sidebarMode,
  onSidebarModeChange,
  onRootNodeSubmitted,
  pinnedNodes,
  onTogglePin,
  onUnpin,
  onClearAllPins,
  selectedPinNodeIds,
  onPinSelectionChange,
  onCreateTreeFromContext,
  autoAiReply,
}: GraphViewProps) {
  const graphNodes = useMemo(() => toGraphNodes(nodes), [nodes]);
  const nodeById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);
  const rootNode = graphNodes.find((n) => n.parentId === null);

  const pinnedNodeIds = useMemo(
    () => new Set((pinnedNodes ?? []).map((p) => p.nodeId)),
    [pinnedNodes],
  );

  const streaming = useStreamingStore();
  const { onNodeReply, onNodeRegenerate, onNodeSummarize } = useStreamingCallbacks(treeId);

  const {
    selectedNodeId,
    setSelectedNodeId,
    editingNodeId,
    editText,
    setEditText,
    handleEditStart,
    handleEditSave,
    handleEditCancel,
  } = useNodeEditing({
    nodeById,
    onEdit,
    onCreateSibling,
    onDelete,
    onDeleteTree,
    selectedTreeId: selectedTreeId ?? null,
    onNodeReply,
    onRootNodeSubmitted,
    pendingEditNodeId,
    onPendingEditHandled,
    focusNodeId,
    onFocusHandled,
    initialSelectedNodeId: controlledSelectedNodeId ?? rootNode?.id ?? null,
    onSelectedNodeChange,
    autoAiReply,
  });

  const callbacks: GraphCallbacks = useMemo(
    () => ({
      onNodeSelect: (nodeId: string) => setSelectedNodeId(nodeId),
      onNodeEdit: (nodeId: string) => {
        const node = nodeById.get(nodeId);
        if (node) handleEditStart(nodeId, node.content);
      },
      onNodeRegenerate: (nodeId: string) => {
        const node = nodeById.get(nodeId);
        onNodeRegenerate(nodeId, node?.parentId ?? null);
      },
      onNodeSummarize: (nodeId: string) => {
        onNodeSummarize(nodeId);
      },
      onNodeDelete: (nodeId: string) => {
        onDelete(nodeId);
      },
      onNodeReply: (nodeId: string) => {
        const node = nodeById.get(nodeId);
        if (node && (node.type === 'ai' || node.type === 'summary')) {
          onAddHumanNode(nodeId);
        } else {
          onNodeReply(nodeId);
        }
      },
      onAddHumanReply: (nodeId: string) => {
        onAddHumanNode(nodeId);
      },
    }),
    [
      nodeById,
      onNodeReply,
      onNodeRegenerate,
      onNodeSummarize,
      onDelete,
      handleEditStart,
      onAddHumanNode,
      setSelectedNodeId,
    ],
  );

  return (
    <div
      style={{
        height: '100%',
        background: COLORS.bg,
        display: 'flex',
        overflow: 'hidden',
        color: COLORS.text,
      }}
    >
      <Sidebar
        nodes={graphNodes}
        selectedNodeId={selectedNodeId}
        onSelect={callbacks.onNodeSelect}
        sidebarMode={sidebarMode}
        onSidebarModeChange={onSidebarModeChange}
        trees={trees}
        selectedTreeId={selectedTreeId}
        onSelectTree={onSelectTree}
        onDeleteTree={onDeleteTree}
        repo={repo}
        onTreeCreated={onTreeCreated}
        onRequestEdit={onRequestEdit}
        pinnedNodes={pinnedNodes}
        onUnpin={onUnpin}
        onClearAllPins={onClearAllPins}
        selectedPinNodeIds={selectedPinNodeIds}
        onPinSelectionChange={onPinSelectionChange}
        onCreateTreeFromContext={onCreateTreeFromContext}
      />
      <GraphRenderer
        nodes={graphNodes}
        selectedNodeId={selectedNodeId}
        callbacks={callbacks}
        streaming={streaming}
        editingNodeId={editingNodeId}
        editText={editText}
        onEditChange={setEditText}
        onEditSave={handleEditSave}
        onEditCancel={handleEditCancel}
        pinnedNodeIds={pinnedNodeIds}
        onTogglePin={onTogglePin}
      />
    </div>
  );
}
