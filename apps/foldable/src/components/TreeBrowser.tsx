import { useMemo, useState } from 'react';
import type { Tree } from '@lineage/core';
import type { FoldMode } from '../fold/types.js';
import { COLORS, FONTS } from '../styles/theme.js';

interface TreeBrowserProps {
  trees: Tree[];
  selectedTreeId: string | null;
  onSelect: (treeId: string) => void;
  /** Delete a tree. The browser handles the confirm step before calling this. */
  onDelete: (treeId: string) => void;
  /** Export all monologues to a JSON backup (share sheet on native, download on web). */
  onBackup: () => Promise<void>;
  onClose: () => void;
  mode: FoldMode;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Searchable list of monologues with per-tree delete (confirm-gated). Replaces
 * the header dropdown. Posture-aware: a full-width sheet when `closed`, a
 * left-anchored drawer when there's room (`book`/`flat`).
 */
export function TreeBrowser({
  trees,
  selectedTreeId,
  onSelect,
  onDelete,
  onBackup,
  onClose,
  mode,
}: TreeBrowserProps) {
  const [query, setQuery] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);

  const runBackup = async () => {
    setBackingUp(true);
    try {
      await onBackup();
    } catch (err) {
      console.error('[foldable] backup failed', err);
    } finally {
      setBackingUp(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return trees
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [trees, query]);

  const drawer = mode !== 'closed';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        justifyContent: 'flex-start',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: drawer ? 'min(380px, 85vw)' : '100%',
          height: '100%',
          background: COLORS.surface,
          borderRight: drawer ? `1px solid ${COLORS.borderHi}` : 'none',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px 8px',
          }}
        >
          <span style={{ fontFamily: FONTS.serif, fontSize: 18, color: COLORS.text }}>
            Monologues
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: COLORS.textSecondary,
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '0 14px 10px' }}>
          <input
            value={query}
            placeholder="Search monologues…"
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 12px',
              background: COLORS.bg,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: COLORS.textSecondary,
                fontFamily: FONTS.mono,
                fontSize: 13,
              }}
            >
              {trees.length === 0 ? 'No monologues yet.' : 'No matches.'}
            </div>
          ) : (
            filtered.map((t) => {
              const selected = t.treeId === selectedTreeId;
              const confirming = confirmingId === t.treeId;
              return (
                <div
                  key={t.treeId}
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 4,
                    marginBottom: 4,
                    borderRadius: 8,
                    background: selected ? COLORS.elevated : 'transparent',
                    borderLeft: `3px solid ${selected ? COLORS.branch : 'transparent'}`,
                  }}
                >
                  <button
                    onClick={() => {
                      onSelect(t.treeId);
                      onClose();
                    }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      color: COLORS.text,
                      cursor: 'pointer',
                      padding: '8px 10px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {t.title}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textSecondary, fontFamily: FONTS.mono }}>
                      {formatDate(t.createdAt)}
                    </div>
                  </button>

                  {confirming ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 6 }}>
                      <button
                        onClick={() => {
                          onDelete(t.treeId);
                          setConfirmingId(null);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#d88a8a',
                          cursor: 'pointer',
                          fontSize: 12,
                          fontFamily: FONTS.mono,
                          padding: '4px 6px',
                        }}
                      >
                        delete
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: COLORS.textSecondary,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontFamily: FONTS.mono,
                          padding: '4px 6px',
                        }}
                      >
                        cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(t.treeId)}
                      aria-label={`Delete ${t.title}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: COLORS.textSecondary,
                        cursor: 'pointer',
                        fontSize: 14,
                        padding: '4px 10px',
                      }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            padding: '10px 14px',
            paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
          }}
        >
          <button
            onClick={runBackup}
            disabled={trees.length === 0 || backingUp}
            style={{
              width: '100%',
              padding: '9px 12px',
              background: 'transparent',
              color: trees.length === 0 ? COLORS.textSecondary : COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              cursor: trees.length === 0 || backingUp ? 'default' : 'pointer',
              fontSize: 13,
              fontFamily: FONTS.mono,
            }}
          >
            {backingUp ? 'Exporting…' : '⤓ Export backup'}
          </button>
        </div>
      </div>
    </div>
  );
}
