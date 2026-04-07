import { useState } from 'react';
import { COLORS, FONTS, nodeColor } from '../../styles/theme.js';
import type { GraphCallbacks, GraphNode } from './GraphRendererTypes.js';
import { ActionBtn, RoleIcon, PinIcon } from './NodeCardShared.js';
import { Markdown } from '../Markdown.js';
import { InlineEditor } from '../InlineEditor.js';

export function CurrentCard({
  node,
  isLeaf,
  callbacks,
  isEditing,
  editText,
  onEditChange,
  onEditSave,
  onEditCancel,
  isPinned,
  onTogglePin,
}: {
  node: GraphNode;
  isLeaf: boolean;
  callbacks: GraphCallbacks;
  isEditing?: boolean;
  editText?: string;
  onEditChange?: (text: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
}) {
  const c = nodeColor(node.type, node.isDeleted);
  const [hover, setHover] = useState(false);

  if (node.isDeleted) {
    return (
      <div
        style={{
          background: 'rgba(255,255,255,0.015)',
          border: `1px solid ${COLORS.border}`,
          borderLeft: `3px solid ${COLORS.muted}44`,
          borderRadius: '8px',
          padding: '22px 26px',
          opacity: 0.35,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
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
        </div>
        <div style={{ textDecoration: 'line-through' }}>
          <Markdown content={node.content} fontSize="13px" color="#383838" />
        </div>
      </div>
    );
  }

  if (node.type === 'summary') {
    return (
      <div
        title="Summary nodes condense the conversation above into a single message. When generating new replies below a summary, only the summary is used as context — not the full original thread."
        style={{
          background: 'rgba(184,160,216,0.06)',
          border: `1px solid ${COLORS.summary}33`,
          borderLeft: `3px solid ${COLORS.summary}`,
          borderRadius: '8px',
          padding: '22px 26px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '2px',
              background: COLORS.summary,
              flexShrink: 0,
            }}
          />
          {onTogglePin && <PinIcon pinned={isPinned ?? false} onClick={onTogglePin} />}
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
          <ActionBtn
            label="Add reply ↓"
            color={COLORS.summary}
            onClick={() => callbacks.onNodeReply(node.id)}
            primary
          />
        </div>
        <Markdown content={node.content} fontSize="13px" color={COLORS.textSecondary} />
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid rgba(255,255,255,0.1)`,
        borderLeft: `3px solid ${c}`,
        borderRadius: '8px',
        padding: '22px 26px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <RoleIcon role={node.type} size={18} />
        {onTogglePin && <PinIcon pinned={isPinned ?? false} onClick={onTogglePin} />}
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
        <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
          depth {node.depth}
        </span>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            gap: '5px',
            visibility: hover || isLeaf ? 'visible' : 'hidden',
          }}
        >
          {node.type === 'human' && node.parentId !== null && (
            <ActionBtn
              label="Edit"
              color={COLORS.human}
              onClick={() => callbacks.onNodeEdit(node.id)}
            />
          )}
          {node.type === 'ai' && (
            <ActionBtn
              label="↺ Regenerate"
              color={COLORS.ai}
              onClick={() => callbacks.onNodeRegenerate(node.id)}
            />
          )}
          <ActionBtn
            label={node.type === 'human' ? 'Generate reply ↓' : 'Add reply ↓'}
            color={c}
            onClick={() => callbacks.onNodeReply(node.id)}
            primary
          />
          {node.parentId !== null && (
            <ActionBtn
              label="∑ Summarize"
              color={COLORS.summary}
              onClick={() => callbacks.onNodeSummarize(node.id)}
            />
          )}
        </div>
      </div>
      {isEditing && onEditChange && onEditSave && onEditCancel ? (
        <InlineEditor
          value={editText ?? ''}
          onChange={onEditChange}
          onSave={onEditSave}
          onCancel={onEditCancel}
        />
      ) : (
        <div>
          <Markdown content={node.content} fontSize="18px" />
        </div>
      )}
    </div>
  );
}
