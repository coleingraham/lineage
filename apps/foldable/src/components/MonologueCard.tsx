import { useState, type CSSProperties } from 'react';
import type { Node } from '@lineage/core';
import { COLORS, FONTS, intentColor } from '../styles/theme.js';
import { Markdown } from './Markdown.js';

interface MonologueCardProps {
  node: Node;
  focused: boolean;
  isRoot: boolean;
  onFocus: () => void;
  onEdit: (content: string) => void;
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
  onFocus,
  onEdit,
  onDelete,
  onDiverge,
}: MonologueCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.content);

  const accent = isRoot ? COLORS.root : intentColor(node.intent);
  const showIntent = node.intent && node.intent !== 'sequence';

  const save = () => {
    onEdit(draft);
    setEditing(false);
  };

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
            onChange={(e) => setDraft(e.target.value)}
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
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button onClick={save} style={{ ...ACTION_STYLE, color: COLORS.branch }}>
              save
            </button>
            <button
              onClick={() => {
                setDraft(node.content);
                setEditing(false);
              }}
              style={ACTION_STYLE}
            >
              cancel
            </button>
          </div>
        </div>
      ) : (
        <Markdown content={node.content} />
      )}

      {focused && !editing && (
        <div
          style={{ display: 'flex', gap: 4, marginTop: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={onDiverge} style={{ ...ACTION_STYLE, color: COLORS.branch }}>
            ⌥ diverge
          </button>
          <button onClick={() => setEditing(true)} style={ACTION_STYLE}>
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
