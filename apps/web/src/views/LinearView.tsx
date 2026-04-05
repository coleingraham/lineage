import { useState, useMemo, useCallback, type RefCallback } from 'react';
import type { Node, Tree, NodeRepository } from '@lineage/core';
import { COLORS, FONTS, nodeColor } from '../styles/theme.js';
import type { GraphCallbacks, GraphNode } from '../components/graph/GraphRendererTypes.js';
import { toGraphNodes } from '../components/graph/convertNodes.js';
import { RoleIcon, ActionBtn } from '../components/graph/NodeCardShared.js';
import {
  buildChildrenMap,
  findDeepestFirstChild,
  buildPathEntries,
} from '../components/graph/linearUtils.js';
import { useStreamingStore } from '../store/streaming.js';
import { useStreamingCallbacks } from '../store/useStreamingCallbacks.js';
import { StreamingCard } from '../components/StreamingCard.js';
import { Sidebar } from '../components/graph/Sidebar.js';
import { Markdown } from '../components/Markdown.js';
import { InlineEditor } from '../components/InlineEditor.js';
import { useNodeEditing } from '../hooks/useNodeEditing.js';

interface LinearViewProps {
  nodes: Node[];
  treeId: string;
  onDelete: (nodeId: string) => void;
  onEdit: (nodeId: string, content: string) => Promise<void>;
  onCompose: (parentNodeId: string, content: string) => Promise<void>;
  onAddHumanNode: (parentNodeId: string) => Promise<void>;
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
}

// ── Sibling navigator ───────────────────────────────────────────────────────

function SiblingNav({
  siblings,
  currentId,
  onSelect,
}: {
  siblings: GraphNode[];
  currentId: string;
  onSelect: (nodeId: string) => void;
}) {
  if (siblings.length <= 1) return null;

  const idx = siblings.findIndex((s) => s.id === currentId);
  const current = idx + 1;
  const total = siblings.length;
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx < siblings.length - 1 ? siblings[idx + 1] : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: COLORS.textSecondary,
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); prev && onSelect(prev.id); }}
        disabled={!prev}
        style={{
          background: 'none',
          border: 'none',
          color: prev ? COLORS.text : COLORS.muted,
          cursor: prev ? 'pointer' : 'default',
          fontSize: '12px',
          padding: '0 4px',
          opacity: prev ? 0.7 : 0.25,
        }}
      >
        ‹
      </button>
      <span style={{ letterSpacing: '0.06em' }}>
        {current} / {total}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); next && onSelect(next.id); }}
        disabled={!next}
        style={{
          background: 'none',
          border: 'none',
          color: next ? COLORS.text : COLORS.muted,
          cursor: next ? 'pointer' : 'default',
          fontSize: '12px',
          padding: '0 4px',
          opacity: next ? 0.7 : 0.25,
        }}
      >
        ›
      </button>
    </div>
  );
}

// ── Linear node card ────────────────────────────────────────────────────────

function LinearNodeCard({
  node,
  siblings,
  isSelected,
  isSuperseded,
  callbacks,
  onSiblingSelect,
  isEditing,
  editText,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onAddHumanReply,
}: {
  node: GraphNode;
  siblings: GraphNode[];
  isSelected: boolean;
  isSuperseded: boolean;
  callbacks: GraphCallbacks;
  onSiblingSelect: (nodeId: string) => void;
  isEditing: boolean;
  editText: string;
  onEditStart: (nodeId: string, content: string) => void;
  onEditChange: (text: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onAddHumanReply: (parentNodeId: string) => void;
}) {
  const c = nodeColor(node.type, node.isDeleted);
  const [hover, setHover] = useState(false);

  // ── Deleted ───────────────────────────────────────────────────────────────
  if (node.isDeleted) {
    return (
      <div
        onClick={() => callbacks.onNodeSelect(node.id)}
        style={{
          background: 'rgba(255,255,255,0.015)',
          border: `1px solid ${COLORS.border}`,
          borderLeft: `3px solid ${COLORS.muted}44`,
          borderRadius: '8px',
          padding: '18px 22px',
          opacity: 0.35,
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span
            style={{
              fontSize: '9px',
              color: COLORS.muted,
              letterSpacing: '0.08em',
              background: COLORS.muted + '18',
              padding: '2px 8px',
              borderRadius: '3px',
              fontFamily: FONTS.mono,
            }}
          >
            DELETED
          </span>
          <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
            depth {node.depth}
          </span>
          <div style={{ flex: 1 }} />
          <SiblingNav siblings={siblings} currentId={node.id} onSelect={onSiblingSelect} />
        </div>
        <div style={{ textDecoration: 'line-through' }}>
          <Markdown content={node.content} fontSize="13px" color="#383838" />
        </div>
      </div>
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (node.type === 'summary') {
    return (
      <div
        onClick={() => callbacks.onNodeSelect(node.id)}
        title="Summary nodes condense the conversation above into a single message. When generating new replies below a summary, only the summary is used as context — not the full original thread."
        style={{
          background: 'rgba(184,160,216,0.06)',
          border: `1px solid ${COLORS.summary}33`,
          borderLeft: `3px solid ${COLORS.summary}`,
          borderRadius: '8px',
          padding: '18px 22px',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '2px',
              background: COLORS.summary,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '10px',
              color: COLORS.summary + 'cc',
              fontFamily: FONTS.mono,
              letterSpacing: '0.08em',
            }}
          >
            SUMMARY · IMMUTABLE
          </span>
          <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
            depth {node.depth}
          </span>
          <div style={{ flex: 1 }} />
          <SiblingNav siblings={siblings} currentId={node.id} onSelect={onSiblingSelect} />
          <ActionBtn
            label="Add reply ↓"
            color={COLORS.summary}
            onClick={() => onAddHumanReply(node.id)}
            primary
          />
        </div>
        <Markdown content={node.content} fontSize="13px" color={COLORS.textSecondary} />
        <div
          style={{
            marginTop: '10px',
            fontSize: '10px',
            color: COLORS.summary + '88',
            fontFamily: FONTS.mono,
            fontStyle: 'italic',
          }}
        >
          This summary replaces the conversation above for context in future LLM calls.
        </div>
      </div>
    );
  }

  // ── Normal ────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={() => callbacks.onNodeSelect(node.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: isSelected ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isSelected ? 'rgba(255,255,255,0.12)' : COLORS.border}`,
        borderLeft: `3px solid ${isSuperseded ? COLORS.muted : c}`,
        borderRadius: '8px',
        padding: '18px 22px',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s, opacity 0.15s',
        opacity: isSuperseded ? 0.4 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <RoleIcon role={node.type} size={16} />
        <span
          style={{
            fontSize: '9px',
            color: c,
            letterSpacing: '0.08em',
            background: c + '18',
            padding: '2px 8px',
            borderRadius: '3px',
            fontFamily: FONTS.mono,
          }}
        >
          {node.type.toUpperCase()}
        </span>
        {isSuperseded && (
          <span
            style={{
              fontSize: '9px',
              color: COLORS.summary + 'aa',
              letterSpacing: '0.06em',
              fontFamily: FONTS.mono,
            }}
          >
            SUPERSEDED
          </span>
        )}
        <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
          depth {node.depth}
        </span>
        <div style={{ flex: 1 }} />
        <SiblingNav siblings={siblings} currentId={node.id} onSelect={onSiblingSelect} />
        {(hover || isSelected) && !isSuperseded && (
          <div style={{ display: 'flex', gap: '5px', marginLeft: '8px' }}>
            {node.type === 'human' && (
              <ActionBtn
                label="Edit"
                color={COLORS.human}
                onClick={() => onEditStart(node.id, node.content)}
              />
            )}
            {node.type === 'ai' && (
              <ActionBtn
                label="↺ Regen"
                color={COLORS.ai}
                onClick={() => callbacks.onNodeRegenerate(node.id)}
              />
            )}
            {node.type === 'human' ? (
              <ActionBtn
                label="Generate reply ↓"
                color={c}
                onClick={() => callbacks.onNodeReply(node.id)}
                primary
              />
            ) : (
              <ActionBtn
                label="Add reply ↓"
                color={c}
                onClick={() => onAddHumanReply(node.id)}
                primary
              />
            )}
            <ActionBtn
              label="∑ Summarize"
              color={COLORS.summary}
              onClick={() => callbacks.onNodeSummarize(node.id)}
            />
          </div>
        )}
      </div>
      {isEditing ? (
        <InlineEditor
          value={editText}
          onChange={onEditChange}
          onSave={onEditSave}
          onCancel={onEditCancel}
        />
      ) : (
        <Markdown content={node.content} fontSize={node.type === 'ai' ? '15px' : '16px'} />
      )}
      {node.metadata.modelName && (
        <div
          style={{
            marginTop: '10px',
            fontSize: '10px',
            color: '#2a2a2a',
            fontFamily: FONTS.mono,
          }}
        >
          {node.metadata.provider}/{node.metadata.modelName}
          {node.metadata.tokenCount != null && ` · ${node.metadata.tokenCount} tokens`}
        </div>
      )}
    </div>
  );
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

export function LinearView({ nodes, treeId, onDelete, onEdit, onCompose, onAddHumanNode, focusNodeId, onFocusHandled, trees, selectedTreeId, onSelectTree, onDeleteTree, repo, onTreeCreated, onRequestEdit, pendingEditNodeId, onPendingEditHandled }: LinearViewProps) {
  const graphNodes = useMemo(() => toGraphNodes(nodes), [nodes]);

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

  const [scrollToNodeId, setScrollToNodeId] = useState<string | null>(null);

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
    onNodeReply,
    pendingEditNodeId,
    onPendingEditHandled,
    focusNodeId,
    onFocusHandled,
    initialSelectedNodeId: defaultLeaf,
    onFocus: (nodeId) => setScrollToNodeId(nodeId),
  });

  const handleAddHumanReply = useCallback(
    (parentNodeId: string) => {
      onAddHumanNode(parentNodeId);
    },
    [onAddHumanNode],
  );

  // When a sibling is selected, navigate to the deepest first-child leaf from that sibling
  const handleSiblingSelect = useCallback(
    (siblingId: string) => {
      setSelectedNodeId(findDeepestFirstChild(siblingId, nodeById, childrenOf));
    },
    [nodeById, childrenOf, setSelectedNodeId],
  );

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
        onNodeReply(nodeId);
      },
    }),
    [nodeById, onNodeReply, onNodeRegenerate, onNodeSummarize, onDelete, handleEditStart],
  );

  const pathEntries = useMemo(
    () =>
      selectedNodeId ? buildPathEntries(selectedNodeId, graphNodes, nodeById, childrenOf) : [],
    [selectedNodeId, graphNodes, nodeById, childrenOf],
  );

  const lastNodeId = pathEntries.length > 0 ? pathEntries[pathEntries.length - 1].node.id : null;

  // Nodes before a summary node on the path are "superseded" — their content is captured
  // in the summary. Find the index of the first summary node on the path.
  const summaryIndex = useMemo(
    () => pathEntries.findIndex((e) => e.node.type === 'summary'),
    [pathEntries],
  );

  // Show streaming card when streaming is active and the parent node is on the path.
  // If the parent's existing child is already on the path (regen case), replace it
  // inline instead of appending at the bottom.
  const pathNodeIds = useMemo(
    () => new Set(pathEntries.map((e) => e.node.id)),
    [pathEntries],
  );
  const isStreamingActive =
    streaming.status !== 'idle' && streaming.parentNodeId != null;
  const streamingParentIdx = isStreamingActive
    ? pathEntries.findIndex((e) => e.node.id === streaming.parentNodeId)
    : -1;
  // Regen: the streaming parent is on the path and has a child after it on the path
  const isRegen = streamingParentIdx >= 0 && streamingParentIdx < pathEntries.length - 1;
  const regenReplacedNodeId = isRegen
    ? pathEntries[streamingParentIdx + 1].node.id
    : null;
  const showStreamingCard =
    isStreamingActive && pathNodeIds.has(streaming.parentNodeId!) && !isRegen;

  // Auto-scroll to the streaming card when it first appears
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
        onSelect={callbacks.onNodeSelect}
        trees={trees}
        selectedTreeId={selectedTreeId}
        onSelectTree={onSelectTree}
        onDeleteTree={onDeleteTree}
        repo={repo}
        onTreeCreated={onTreeCreated}
        onRequestEdit={onRequestEdit}
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
          {pathEntries.map(({ node, siblings }, i) => {
            // During regen, replace the old AI node (and everything after it)
            // with the streaming card
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
            // Skip nodes after the replaced node during regen
            if (regenReplacedNodeId && i > pathEntries.findIndex((e) => e.node.id === regenReplacedNodeId)) {
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
