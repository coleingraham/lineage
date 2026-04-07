import { useState, useMemo, useCallback, type RefCallback } from 'react';
import type { Node, Tree, NodeRepository } from '@lineage/core';
import { COLORS } from '../styles/theme.js';
import type {
  GraphCallbacks,
  SidebarMode,
  PinnedNode,
} from '../components/graph/GraphRendererTypes.js';
import { toGraphNodes } from '../components/graph/convertNodes.js';
import {
  buildChildrenMap,
  findDeepestFirstChild,
  buildPathEntries,
} from '../components/graph/linearUtils.js';
import { useStreamingStore } from '../store/streaming.js';
import { useStreamingCallbacks } from '../store/useStreamingCallbacks.js';
import { StreamingCard } from '../components/StreamingCard.js';
import { Sidebar } from '../components/graph/Sidebar.js';
import { useNodeEditing } from '../hooks/useNodeEditing.js';
import { LinearNodeCard } from '../components/LinearNodeCard.js';
import { ContextCard } from '../components/ContextCard.js';

interface LinearViewProps {
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
}

// ── Vertical connector between cards ────────────────────────────────────────

function VerticalConnector() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
      <div
        style={{
          width: '1px',
          height: '16px',
          background: 'rgba(255,255,255,0.06)',
        }}
      />
    </div>
  );
}

// ── LinearView ──────────────────────────────────────────────────────────────

export function LinearView({
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
}: LinearViewProps) {
  const graphNodes = useMemo(() => toGraphNodes(nodes), [nodes]);

  const pinnedNodeIds = useMemo(
    () => new Set((pinnedNodes ?? []).map((p) => p.nodeId)),
    [pinnedNodes],
  );

  const childrenOf = useMemo(() => buildChildrenMap(graphNodes), [graphNodes]);

  const nodeById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);

  // Find deepest leaf on the default path (first child at each level)
  const defaultLeaf = useMemo(() => {
    const root = graphNodes.find((n) => n.parentId === null);
    if (!root) return null;
    return findDeepestFirstChild(root.id, nodeById, childrenOf);
  }, [graphNodes, nodeById, childrenOf]);

  const streaming = useStreamingStore();
  const { onNodeReply, onNodeRegenerate, onNodeSummarize } = useStreamingCallbacks(treeId);

  const [scrollToNodeId, setScrollToNodeId] = useState<string | null>(
    controlledSelectedNodeId ?? defaultLeaf,
  );

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
    onNodeReply,
    onRootNodeSubmitted,
    pendingEditNodeId,
    onPendingEditHandled,
    focusNodeId,
    onFocusHandled,
    initialSelectedNodeId: controlledSelectedNodeId ?? defaultLeaf,
    onSelectedNodeChange,
    onFocus: (nodeId) => setScrollToNodeId(nodeId),
  });

  const handleAddHumanReply = useCallback(
    (parentNodeId: string) => {
      onAddHumanNode(parentNodeId);
    },
    [onAddHumanNode],
  );

  // When a sibling is selected, navigate to the deepest most-recent child from that sibling
  const handleSiblingSelect = useCallback(
    (siblingId: string) => {
      const leafId = findDeepestFirstChild(siblingId, nodeById, childrenOf);
      setSelectedNodeId(leafId);
    },
    [nodeById, childrenOf, setSelectedNodeId],
  );

  const callbacks: GraphCallbacks = useMemo(
    () => ({
      onNodeSelect: (nodeId: string) => {
        setSelectedNodeId(findDeepestFirstChild(nodeId, nodeById, childrenOf));
      },
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
        onNodeReply(nodeId);
      },
    }),
    [
      nodeById,
      childrenOf,
      onNodeReply,
      onNodeRegenerate,
      onNodeSummarize,
      onDelete,
      handleEditStart,
      setSelectedNodeId,
    ],
  );

  const pathEntries = useMemo(
    () =>
      selectedNodeId ? buildPathEntries(selectedNodeId, graphNodes, nodeById, childrenOf) : [],
    [selectedNodeId, graphNodes, nodeById, childrenOf],
  );

  const lastNodeId = pathEntries.length > 0 ? pathEntries[pathEntries.length - 1].node.id : null;

  const currentTree = useMemo(
    () => trees?.find((t) => t.treeId === treeId),
    [trees, treeId],
  );
  const contextSources = currentTree?.contextSources;

  // Nodes before a summary node on the path are "superseded"
  const summaryIndex = useMemo(
    () => pathEntries.findIndex((e) => e.node.type === 'summary'),
    [pathEntries],
  );

  // Streaming card logic
  const pathNodeIds = useMemo(() => new Set(pathEntries.map((e) => e.node.id)), [pathEntries]);
  const isStreamingActive = streaming.status !== 'idle' && streaming.parentNodeId != null;
  const streamingParentIdx = isStreamingActive
    ? pathEntries.findIndex((e) => e.node.id === streaming.parentNodeId)
    : -1;
  const isRegen = streamingParentIdx >= 0 && streamingParentIdx < pathEntries.length - 1;
  const regenReplacedNodeId = isRegen ? pathEntries[streamingParentIdx + 1].node.id : null;
  const showStreamingCard =
    isStreamingActive && pathNodeIds.has(streaming.parentNodeId!) && !isRegen;

  const streamingCardRef: RefCallback<HTMLDivElement> = useCallback((el) => {
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: COLORS.bg }}>
      <Sidebar
        nodes={graphNodes}
        selectedNodeId={selectedNodeId}
        onSelect={(nodeId: string) => {
          const leafId = findDeepestFirstChild(nodeId, nodeById, childrenOf);
          setSelectedNodeId(leafId);
          setScrollToNodeId(nodeId);
        }}
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
      <div
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          padding: '40px 20px',
          overflowY: 'auto',
        }}
      >
        <div style={{ width: '100%', maxWidth: '720px' }}>
          {contextSources && contextSources.length > 0 && (
            <>
              <ContextCard
                contextSources={contextSources}
                trees={trees}
                repo={repo}
                onNavigate={(navTreeId) => onSelectTree(navTreeId)}
              />
              <VerticalConnector />
            </>
          )}
          {pathEntries.map(({ node, siblings }, i) => {
            if (regenReplacedNodeId === node.id) {
              return (
                <div key="streaming-regen" ref={streamingCardRef}>
                  <VerticalConnector />
                  <StreamingCard
                    content={streaming.content}
                    thinkingContent={streaming.thinkingContent}
                    isThinking={streaming.isThinking}
                    status={streaming.status}
                    error={streaming.error}
                    onCancel={streaming.cancel}
                    onRetry={() => callbacks.onNodeRegenerate(node.id)}
                    variant="full"
                  />
                </div>
              );
            }
            if (
              regenReplacedNodeId &&
              i > pathEntries.findIndex((e) => e.node.id === regenReplacedNodeId)
            ) {
              return null;
            }
            return (
              <div
                key={node.id}
                ref={
                  node.id === scrollToNodeId
                    ? (el) => {
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          setScrollToNodeId(null);
                        }
                      }
                    : undefined
                }
              >
                {i > 0 && <VerticalConnector />}
                <LinearNodeCard
                  node={node}
                  siblings={siblings}
                  isSelected={node.id === selectedNodeId}
                  isSuperseded={summaryIndex !== -1 && i < summaryIndex}
                  callbacks={callbacks}
                  onSiblingSelect={handleSiblingSelect}
                  isEditing={editingNodeId === node.id}
                  editText={editText}
                  onEditStart={handleEditStart}
                  onEditChange={setEditText}
                  onEditSave={handleEditSave}
                  onEditCancel={handleEditCancel}
                  isPinned={pinnedNodeIds.has(node.id)}
                  onTogglePin={() => onTogglePin(node.id)}
                  onAddHumanReply={handleAddHumanReply}
                />
              </div>
            );
          })}
          {showStreamingCard && (
            <div ref={streamingCardRef}>
              <VerticalConnector />
              <StreamingCard
                content={streaming.content}
                thinkingContent={streaming.thinkingContent}
                isThinking={streaming.isThinking}
                status={streaming.status}
                error={streaming.error}
                onCancel={streaming.cancel}
                onRetry={() => callbacks.onNodeReply(lastNodeId!)}
                variant="full"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
