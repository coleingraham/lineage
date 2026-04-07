import { COLORS, FONTS } from '../styles/theme.js';
import type { GraphNode } from './graph/GraphRendererTypes.js';

export function SiblingNav({
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
        onClick={(e) => {
          e.stopPropagation();
          if (prev) onSelect(prev.id);
        }}
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
        &#8249;
      </button>
      <span style={{ letterSpacing: '0.06em' }}>
        {current} / {total}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (next) onSelect(next.id);
        }}
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
        &#8250;
      </button>
    </div>
  );
}
