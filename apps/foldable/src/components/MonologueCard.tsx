import { type CSSProperties } from 'react';
import type { Node } from '@lineage/core';
import { COLORS, FONTS, intentColor } from '../styles/theme.js';
import { Markdown } from './Markdown.js';

interface MonologueCardProps {
  node: Node;
  focused: boolean;
  isRoot: boolean;
  /** Edit state is owned by the parent so it survives layout (linear↔book) swaps. */
  editing: boolean;
  draft: string;
  onFocus: () => void;
  onStartEdit: () => void;
  onDraftChange: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onDiverge: () => void;
}

const ACTION_STYLE: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: COLORS.textSecondary,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: FONTS.mono,
  padding: '2px 6px',
};

/** A single monologue node on the active line. Tap to focus; act via the footer. */
export function MonologueCard({
  node,
  focused,
  isRoot,
  editing,
  draft,
  onFocus,
  onStartEdit,
  onDraftChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onDiverge,
}: MonologueCardProps) {
  const accent = isRoot ? COLORS.root : intentColor(node.intent);
  const showIntent = node.intent && node.intent !== 'sequence';

  return (
    <div
      onClick={focused ? undefined : onFocus}
      style={{
        position: 'relative',
        padding: '12px 14px 8px',
        marginLeft: 2,
        borderLeft: `3px solid ${accent}`,
        background: focused ? COLORS.elevated : COLORS.surface,
        borderRadius: '0 10px 10px 0',
        cursor: focused ? 'default' : 'pointer',
        opacity: focused ? 1 : 0.82,
      }}
    >
      {(showIntent || isRoot) && (
        <div
          style={{
            display: 'inline-block',
            marginBottom: 6,
            padding: '1px 8px',
            borderRadius: 999,
            fontSize: 11,
            fontFamily: FONTS.mono,
            color: accent,
            border: `1px solid ${accent}`,
            textTransform: 'lowercase',
          }}
        >
          {isRoot ? 'root' : node.intent}
        </div>
      )}

      {editing ? (
        <div onClick={(e) => e.stopPropagation()}>
          <textarea
            value={draft}
            autoFocus
            onChange={(e) => onDraftChange(e.target.value)}
            rows={Math.min(12, Math.max(2, draft.split('\n').length))}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: 10,
              background: COLORS.bg,
              color: COLORS.text,
              border: `1px solid ${COLORS.borderHi}`,
              borderRadius: 8,
              fontSize: 15,
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <button onClick={onSaveEdit} style={{ ...ACTION_STYLE, color: COLORS.branch }}>
              save
            </button>
            <button onClick={onCancelEdit} style={ACTION_STYLE}>
              cancel
            </button>
            {!isRoot && (
              <span style={{ fontSize: 10, color: COLORS.textSecondary, fontFamily: FONTS.mono }}>
                saves as a sibling — original kept
              </span>
            )}
          </div>
        </div>
      ) : (
        <Markdown content={node.content} />
      )}

      {focused && !editing && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={onDiverge} style={{ ...ACTION_STYLE, color: COLORS.branch }}>
            ⌥ diverge
          </button>
          <button onClick={onStartEdit} style={ACTION_STYLE}>
            edit
          </button>
          {!isRoot && (
            <button onClick={onDelete} style={{ ...ACTION_STYLE, color: '#d88a8a' }}>
              delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
