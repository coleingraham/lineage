import { useState } from 'react';
import type { Tag } from '@lineage/core';
import { COLORS, FONTS } from '../styles/theme.js';
import { useAi } from '../hooks/useAi.js';
import { buildTagPrompt, parseTags } from '../lib/tags.js';

interface TagEditorProps {
  node: { nodeId: string; content: string };
  currentTags: Tag[];
  /** All known tags, for quick re-use without retyping. */
  allTags: Tag[];
  onAdd: (nodeId: string, names: string[]) => Promise<void>;
  onRemove: (nodeId: string, tagId: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Per-node tag editor: shows current tags (removable), lets the author add
 * tags manually or reuse existing ones, and offers on-device AI suggestions.
 * Adding is idempotent — names already on the node (or existing tags) are
 * reused, never recreated.
 */
export function TagEditor({ node, currentTags, allTags, onAdd, onRemove, onClose }: TagEditorProps) {
  const ai = useAi();
  const [input, setInput] = useState('');

  const currentNames = new Set(currentTags.map((t) => t.name.toLowerCase()));

  const addNames = async (names: string[]) => {
    const fresh = names.filter((n) => n && !currentNames.has(n.toLowerCase()));
    if (fresh.length > 0) await onAdd(node.nodeId, fresh);
  };

  const submitManual = async () => {
    const names = parseTags(input);
    setInput('');
    await addNames(names);
  };

  const suggest = async () => {
    const text = await ai.generate(buildTagPrompt(node.content));
    if (text != null) await addNames(parseTags(text));
  };

  // Existing tags not already on this node — quick add.
  const reusable = allTags
    .filter((t) => !currentNames.has(t.name.toLowerCase()))
    .filter((t, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === t.name.toLowerCase()) === i)
    .slice(0, 24);

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
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FONTS.serif, fontSize: 18, color: COLORS.text }}>🏷 Tags</span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Current tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {currentTags.length === 0 ? (
            <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>No tags yet.</span>
          ) : (
            currentTags.map((t) => (
              <span
                key={t.tagId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  fontFamily: FONTS.mono,
                  color: COLORS.text,
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                {t.name}
                <button
                  onClick={() => void onRemove(node.nodeId, t.tagId)}
                  aria-label={`Remove ${t.name}`}
                  style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, cursor: 'pointer', padding: 0, fontSize: 12 }}
                >
                  ✕
                </button>
              </span>
            ))
          )}
        </div>

        {/* Manual add */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            placeholder="Add tags (comma-separated)…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitManual();
              }
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: COLORS.bg,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button onClick={() => void submitManual()} disabled={!input.trim()} style={primary(!input.trim())}>
            add
          </button>
        </div>

        {/* AI suggest */}
        {ai.supported && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => void suggest()} disabled={ai.busy !== null} style={primary(ai.busy !== null)}>
              {ai.busy ? (
                <>
                  <span className="spinner" style={{ marginRight: 6 }} />
                  suggesting…
                </>
              ) : (
                '✨ suggest tags'
              )}
            </button>
            {ai.error && (
              <span style={{ fontSize: 12, color: '#d88a8a', fontFamily: FONTS.mono }}>{ai.error}</span>
            )}
          </div>
        )}

        {/* Reuse existing */}
        {reusable.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontFamily: FONTS.mono, color: COLORS.textSecondary, margin: '0 0 6px 2px' }}>
              reuse existing
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 140 }}>
              {reusable.map((t) => (
                <button
                  key={t.tagId}
                  onClick={() => void addNames([t.name])}
                  style={{
                    fontSize: 12,
                    fontFamily: FONTS.mono,
                    color: COLORS.textSecondary,
                    background: 'transparent',
                    border: `1px dashed ${COLORS.border}`,
                    borderRadius: 999,
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                >
                  + {t.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function primary(disabled: boolean) {
  return {
    padding: '8px 14px',
    background: disabled ? COLORS.dim : COLORS.branch,
    color: disabled ? COLORS.textSecondary : COLORS.bg,
    border: 'none',
    borderRadius: 8,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: FONTS.mono,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
  };
}
