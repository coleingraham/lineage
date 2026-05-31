import type { ContextSourceInfo } from '../hooks/useTreeData.js';
import { COLORS, FONTS } from '../styles/theme.js';

interface ContextPanelProps {
  sources: ContextSourceInfo[];
  /** Open the source node in its tree. */
  onOpen: (treeId: string, nodeId: string) => void;
  onClose: () => void;
}

/**
 * Shows where a context-grounded tree's pinned background comes from. Each entry
 * names its source tree and previews the node; tap to jump to it.
 */
export function ContextPanel({ sources, onOpen, onClose }: ContextPanelProps) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          maxHeight: '88%',
          display: 'flex',
          flexDirection: 'column',
          background: COLORS.surface,
          borderTop: `1px solid ${COLORS.borderHi}`,
          borderRadius: '14px 14px 0 0',
          padding: 16,
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONTS.serif, fontSize: 18, color: COLORS.text }}>
            🔗 Context sources ({sources.length})
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
          This monologue is grounded in these pinned thoughts when generating AI replies and
          summaries. Tap one to open it where it came from.
        </p>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sources.map((s) => (
            <button
              key={`${s.treeId}:${s.nodeId}`}
              onClick={() => {
                onOpen(s.treeId, s.nodeId);
                onClose();
              }}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                background: COLORS.bg,
                border: `1px solid ${COLORS.border}`,
                borderLeft: `3px solid ${COLORS.ai}`,
                borderRadius: '0 8px 8px 0',
                color: COLORS.text,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontFamily: FONTS.mono,
                  color: COLORS.textSecondary,
                  marginBottom: 4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                from “{s.treeTitle}” →
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.45,
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 3,
                  overflow: 'hidden',
                }}
              >
                {s.content || '(empty)'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
