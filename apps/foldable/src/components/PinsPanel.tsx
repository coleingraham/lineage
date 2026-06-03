import { useEffect, useState } from 'react';
import type { PinnedRef } from '../lib/pins.js';
import { COLORS, FONTS } from '../styles/theme.js';

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
  /** Create a new monologue whose context sources are the pins. */
  onCreate: (refs: PinnedRef[]) => Promise<void>;
  /** Merge the pins into a node in the current monologue (in-tree). */
  onMerge?: (refs: PinnedRef[]) => Promise<void>;
  /** The currently open monologue, if any — merging requires same-tree pins. */
  currentTreeId?: string | null;
  onClose: () => void;
}

/**
 * Pinned thoughts → a new monologue. Mirrors the desktop pin/summarize/
 * new-from-context flow: the pins become the new tree's context sources, and
 * any pin that isn't already a summary is summarized on-device first (forced).
 */
export function PinsPanel({
  pins,
  resolve,
  onRemove,
  onClear,
  onCreate,
  onMerge,
  currentTreeId,
  onClose,
}: PinsPanelProps) {
  const [resolved, setResolved] = useState<ResolvedPin[]>([]);
  const [creating, setCreating] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all(pins.map(async (ref) => ({ ref, content: (await resolve(ref)) ?? '' }))).then(
      (list) => {
        if (active) setResolved(list.filter((r) => r.content));
      },
    );
    return () => {
      active = false;
    };
  }, [pins, resolve]);

  const create = async () => {
    if (resolved.length === 0) return;
    setCreating(true);
    try {
      await onCreate(resolved.map((r) => r.ref));
    } finally {
      setCreating(false);
    }
  };

  // In-tree merge: every pin must belong to the open monologue, since the merge
  // node's summary parents live alongside it in the same tree.
  const canMerge =
    !!onMerge &&
    currentTreeId != null &&
    resolved.length > 0 &&
    resolved.every((r) => r.ref.treeId === currentTreeId);

  const merge = async () => {
    if (!onMerge || resolved.length === 0) return;
    setMerging(true);
    try {
      await onMerge(resolved.map((r) => r.ref));
    } finally {
      setMerging(false);
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
            style={{
              background: 'transparent',
              border: 'none',
              color: COLORS.textSecondary,
              fontSize: 20,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.5 }}>
          These become the new monologue’s context. Thoughts that aren’t already summaries are
          summarized on-device first.
        </p>

        <div
          style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}
        >
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
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: COLORS.textSecondary,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={onClear} disabled={resolved.length === 0} style={ghost}>
            clear all
          </button>
          {onMerge && (
            <button
              onClick={merge}
              disabled={merging || !canMerge}
              title={
                canMerge
                  ? 'Merge the pins into a new node in the current monologue'
                  : 'Pin only thoughts from the open monologue to merge in-tree'
              }
              style={{
                marginLeft: 'auto',
                padding: '9px 16px',
                background: 'transparent',
                color: !canMerge ? COLORS.dim : COLORS.branch,
                border: `1px solid ${!canMerge ? COLORS.border : COLORS.branch}`,
                borderRadius: 8,
                cursor: !canMerge ? 'default' : 'pointer',
                fontFamily: FONTS.mono,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {merging ? (
                <>
                  <span className="spinner" style={{ marginRight: 6 }} />
                  Summarizing…
                </>
              ) : (
                'Merge into current'
              )}
            </button>
          )}
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
            {creating ? (
              <>
                <span className="spinner" style={{ marginRight: 6 }} />
                Summarizing…
              </>
            ) : (
              'New monologue from context'
            )}
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
