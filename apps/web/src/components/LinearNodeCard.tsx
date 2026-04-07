import { useState } from 'react';
import { COLORS, FONTS, nodeColor } from '../styles/theme.js';
import type { GraphCallbacks, GraphNode } from './graph/GraphRendererTypes.js';
import { RoleIcon, ActionBtn } from './graph/NodeCardShared.js';
import { Markdown } from './Markdown.js';
import { InlineEditor } from './InlineEditor.js';
import { SiblingNav } from './SiblingNav.js';

export function LinearNodeCard({
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
      {siblings.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
          <SiblingNav siblings={siblings} currentId={node.id} onSelect={onSiblingSelect} />
        </div>
      )}
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
        <div style={{ display: 'flex', gap: '5px', visibility: hover || isSelected ? 'visible' : 'hidden' }}>
          {node.type === 'human' && node.parentId !== null && (
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
          {node.parentId !== null && (
            <ActionBtn
              label="∑ Summarize"
              color={COLORS.summary}
              onClick={() => callbacks.onNodeSummarize(node.id)}
            />
          )}
        </div>
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
