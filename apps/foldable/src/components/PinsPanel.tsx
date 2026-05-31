import { useEffect, useState } from 'react';
import type { PinnedRef } from '../lib/pins.js';
import { COLORS, FONTS } from '../styles/theme.js';
import { useAi } from '../hooks/useAi.js';
import { buildSummaryPrompt } from '../lib/aiPrompts.js';

interface ResolvedPin {
  ref: PinnedRef;
  content: string;
}

interface PinsPanelProps {
  pins: PinnedRef[];
  /** Fetch a pinned node's content (null if it no longer exists). */
  resolve: (ref: PinnedRef) => Promise<string | null>;
  onRemove: (ref: PinnedRef) => void;
  onClear: () => void;
  /** Create a new monologue seeded with `rootContent`, keeping the pins as context. */
  onCreate: (rootContent: string, refs: PinnedRef[]) => Promise<void>;
  onClose: () => void;
}

/**
 * Pinned thoughts → a new monologue. Mirrors the desktop pin / summarize /
 * new-from-context flow: the pins become the new tree's context sources, and
 * the opening node is either an on-device AI summary of them or the gathered
 * text (author-editable afterwards).
 */
export function PinsPanel({ pins, resolve, onRemove, onClear, onCreate, onClose }: PinsPanelProps) {
  const ai = useAi();
  const [resolved, setResolved] = useState<ResolvedPin[]>([]);
  const [summarize, setSummarize] = useState(ai.supported);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all(
      pins.map(async (ref) => ({ ref, content: (await resolve(ref)) ?? '' })),
    ).then((list) => {
      if (active) setResolved(list.filter((r) => r.content));
    });
    return () => {
      active = false;
    };
  }, [pins, resolve]);

  const create = async () => {
    if (resolved.length === 0) return;
    setCreating(true);
    try {
      const gathered = resolved.map((r) => r.content).join('\n\n');
      let rootContent = gathered;
      if (summarize && ai.supported) {
        const text = await ai.generate(buildSummaryPrompt(gathered));
        if (text) rootContent = text;
      }
      await onCreate(rootContent, resolved.map((r) => r.ref));
    } finally {
      setCreating(false);
    }
  };

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
            📌 Pinned ({resolved.length})
          </span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resolved.length === 0 ? (
            <div style={{ color: COLORS.textSecondary, fontSize: 13, padding: '12px 4px' }}>
              No pinned thoughts. Pin a node (its footer) to gather material here.
            </div>
          ) : (
            resolved.map(({ ref, content }) => (
              <div
                key={`${ref.treeId}:${ref.nodeId}`}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  padding: '8px 10px',
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                    overflow: 'hidden',
                  }}
                >
                  {content}
                </div>
                <button
                  onClick={() => onRemove(ref)}
                  aria-label="Unpin"
                  style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, cursor: 'pointer', fontSize: 14 }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {ai.busy && (
          <div style={{ fontSize: 12, fontFamily: FONTS.mono, color: COLORS.textSecondary, textAlign: 'center' }}>
            {ai.busy}
          </div>
        )}
        {ai.error && (
          <div style={{ fontSize: 12, fontFamily: FONTS.mono, color: '#d88a8a', textAlign: 'center' }}>
            {ai.error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {ai.supported && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.textSecondary }}>
              <input type="checkbox" checked={summarize} onChange={(e) => setSummarize(e.target.checked)} />
              summarize into the opening
            </label>
          )}
          <button onClick={onClear} disabled={resolved.length === 0} style={ghost}>
            clear all
          </button>
          <button
            onClick={create}
            disabled={creating || resolved.length === 0}
            style={{
              marginLeft: 'auto',
              padding: '9px 16px',
              background: creating || resolved.length === 0 ? COLORS.dim : COLORS.branch,
              color: creating || resolved.length === 0 ? COLORS.textSecondary : COLORS.bg,
              border: 'none',
              borderRadius: 8,
              cursor: creating || resolved.length === 0 ? 'default' : 'pointer',
              fontFamily: FONTS.mono,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {creating ? 'Creating…' : 'New monologue from context'}
          </button>
        </div>
      </div>
    </div>
  );
}

const ghost = {
  padding: '8px 12px',
  background: 'transparent',
  color: COLORS.textSecondary,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: FONTS.mono,
} as const;
