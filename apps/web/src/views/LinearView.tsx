import { useState, useMemo, useCallback, useRef, useEffect, type RefCallback } from 'react';
import type { Node } from '@lineage/core';
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
import { ComposeInput } from '../components/ComposeInput.js';
import type { ComposeInputHandle } from '../components/ComposeInput.js';

interface LinearViewProps {
  nodes: Node[];
  treeId: string;
  onDelete: (nodeId: string) => void;
  onEdit: (nodeId: string, content: string) => Promise<void>;
  onCompose: (parentNodeId: string, content: string) => Promise<void>;
  focusNodeId: string | null;
  onFocusHandled: () => void;
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
        onClick={() => prev && onSelect(prev.id)}
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
        onClick={() => next && onSelect(next.id)}
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
        <p
          style={{
            fontFamily: FONTS.mono,
            fontSize: '13px',
            color: '#383838',
            lineHeight: 1.75,
            margin: 0,
            textDecoration: 'line-through',
          }}
        >
          {node.content || '(empty)'}
        </p>
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
        </div>
        <p
          style={{
            fontFamily: FONTS.mono,
            fontSize: '13px',
            color: COLORS.textSecondary,
            lineHeight: 1.75,
            margin: 0,
          }}
        >
          {node.content || '(empty)'}
        </p>
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
        <div>
          <textarea
            value={editText}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onEditSave();
              }
              if (e.key === 'Escape') onEditCancel();
            }}
            autoFocus
            style={{
              width: '100%',
              minHeight: '80px',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid rgba(255,255,255,0.15)`,
              borderRadius: '4px',
              fontFamily: FONTS.serif,
              fontSize: '16px',
              color: '#ececec',
              lineHeight: 1.65,
              padding: '8px 10px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={onEditCancel}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.border}`,
                borderRadius: '4px',
                padding: '4px 12px',
                fontFamily: FONTS.mono,
                fontSize: '10px',
                color: COLORS.textSecondary,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onEditSave}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: `1px solid rgba(255,255,255,0.15)`,
                borderRadius: '4px',
                padding: '4px 12px',
                fontFamily: FONTS.mono,
                fontSize: '10px',
                color: COLORS.text,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            fontFamily: FONTS.serif,
            fontWeight: 400,
            fontSize: node.type === 'ai' ? '15px' : '16px',
            color: '#ececec',
            lineHeight: 1.65,
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}
        >
          {node.content || '(empty)'}
        </div>
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

export function LinearView({ nodes, treeId, onDelete, onEdit, onCompose, focusNodeId, onFocusHandled }: LinearViewProps) {
  const composeRef = useRef<ComposeInputHandle>(null);
  const graphNodes = useMemo(() => toGraphNodes(nodes), [nodes]);

  const childrenOf = useMemo(() => buildChildrenMap(graphNodes), [graphNodes]);

  const nodeById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);

  // Find deepest leaf on the default path (first child at each level)
  const defaultLeaf = useMemo(() => {
    const root = graphNodes.find((n) => n.parentId === null);
    if (!root) return null;
    return findDeepestFirstChild(root.id, nodeById, childrenOf);
  }, [graphNodes, nodeById, childrenOf]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(defaultLeaf);

  // ── Inline editing state ──────────────────────────────────────────────────
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const handleEditStart = useCallback((nodeId: string, content: string) => {
    setEditingNodeId(nodeId);
    setEditText(content);
  }, []);

  const handleEditSave = useCallback(() => {
    if (editingNodeId) {
      onEdit(editingNodeId, editText);
      setEditingNodeId(null);
      setEditText('');
    }
  }, [editingNodeId, editText, onEdit]);

  const handleEditCancel = useCallback(() => {
    setEditingNodeId(null);
    setEditText('');
  }, []);

  const handleAddHumanReply = useCallback(() => {
    composeRef.current?.focus();
  }, []);

  // Focus newly created node after streaming completes
  const [scrollToNodeId, setScrollToNodeId] = useState<string | null>(null);
  useEffect(() => {
    if (focusNodeId && nodeById.has(focusNodeId)) {
      setSelectedNodeId(focusNodeId);
      setScrollToNodeId(focusNodeId);
      onFocusHandled();
    }
  }, [focusNodeId, nodeById, onFocusHandled]);

  // When a sibling is selected, navigate to the deepest first-child leaf from that sibling
  const handleSiblingSelect = useCallback(
    (siblingId: string) => {
      setSelectedNodeId(findDeepestFirstChild(siblingId, nodeById, childrenOf));
    },
    [nodeById, childrenOf],
  );

  const streaming = useStreamingStore();
  const { onNodeReply, onNodeRegenerate, onNodeSummarize } = useStreamingCallbacks(treeId);

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

  // Show streaming card at the bottom when streaming is active and the parent node
  // is visible in the current path (handles both reply and regen cases).
  const pathNodeIds = useMemo(
    () => new Set(pathEntries.map((e) => e.node.id)),
    [pathEntries],
  );
  const showStreamingCard =
    streaming.status !== 'idle' &&
    streaming.parentNodeId != null &&
    pathNodeIds.has(streaming.parentNodeId);

  // Auto-scroll to the streaming card when it first appears
  const streamingCardRef: RefCallback<HTMLDivElement> = useCallback((el) => {
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);

  return (
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
        {pathEntries.map(({ node, siblings }, i) => (
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
        ))}
        {showStreamingCard && (
          <div ref={streamingCardRef}>
            <VerticalConnector />
            <StreamingCard
              content={streaming.content}
              status={streaming.status}
              error={streaming.error}
              onCancel={streaming.cancel}
              onRetry={() => callbacks.onNodeReply(lastNodeId!)}
              variant="full"
            />
          </div>
        )}
        {lastNodeId && streaming.status === 'idle' && (
          <ComposeInput
            ref={composeRef}
            onSend={(content) => onCompose(lastNodeId, content)}
            placeholder="Type a message..."
          />
        )}
      </div>
    </div>
  );
}
