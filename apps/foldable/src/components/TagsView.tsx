import { useEffect, useState } from 'react';
import type { NodeRepository, Tag, TagCategory } from '@lineage/core';
import { COLORS, FONTS } from '../styles/theme.js';

interface Match {
  treeId: string;
  nodeId: string;
  treeTitle: string;
  content: string;
}

interface TagsViewProps {
  repo: NodeRepository;
  categories: TagCategory[];
  tags: Tag[];
  onOpenNode: (treeId: string, nodeId: string) => void;
  onClose: () => void;
}

/**
 * Browse tags grouped by category and search nodes by tag. Selecting tags runs
 * `findNodesByTags` (any/all) across all trees; tap a result to open it.
 */
export function TagsView({ repo, categories, tags, onOpenNode, onClose }: TagsViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchAll, setMatchAll] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedIds = [...selected];
  const selectedKey = selectedIds.sort().join(',');

  useEffect(() => {
    if (selected.size === 0) {
      setMatches([]);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const nodes = await repo.findNodesByTags(selectedIds, { matchAll });
        const titles = new Map<string, string>();
        const out: Match[] = [];
        for (const n of nodes) {
          let title = titles.get(n.treeId);
          if (title === undefined) {
            title = await repo
              .getTree(n.treeId)
              .then((t) => t.title)
              .catch(() => 'Untitled');
            titles.set(n.treeId, title);
          }
          out.push({ treeId: n.treeId, nodeId: n.nodeId, treeTitle: title, content: n.content });
        }
        if (active) setMatches(out);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // selectedKey captures the selection set.
  }, [repo, selectedKey, matchAll]);

  const toggle = (tagId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });

  const tagsByCategory = categories
    .map((c) => ({ category: c, tags: tags.filter((t) => t.categoryId === c.categoryId) }))
    .filter((g) => g.tags.length > 0);

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
          <span style={{ fontFamily: FONTS.serif, fontSize: 18, color: COLORS.text }}>🏷 Tags</span>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Tag chips by category */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '40%', overflowY: 'auto' }}>
          {tagsByCategory.length === 0 ? (
            <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>
              No tags yet. Add tags to nodes (🏷 on a card) to browse them here.
            </span>
          ) : (
            tagsByCategory.map(({ category, tags: catTags }) => (
              <div key={category.categoryId}>
                <div style={{ fontSize: 11, fontFamily: FONTS.mono, color: COLORS.textSecondary, margin: '0 0 5px 2px' }}>
                  {category.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {catTags.map((t) => {
                    const on = selected.has(t.tagId);
                    return (
                      <button
                        key={t.tagId}
                        onClick={() => toggle(t.tagId)}
                        style={{
                          fontSize: 12,
                          fontFamily: FONTS.mono,
                          color: on ? COLORS.bg : COLORS.text,
                          background: on ? COLORS.branch : 'transparent',
                          border: `1px solid ${on ? COLORS.branch : COLORS.border}`,
                          borderRadius: 999,
                          padding: '2px 9px',
                          cursor: 'pointer',
                        }}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {selected.size > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.textSecondary }}>
            <input type="checkbox" checked={matchAll} onChange={(e) => setMatchAll(e.target.checked)} />
            match all selected tags
          </label>
        )}

        {/* Results */}
        <div style={{ flex: 1, minHeight: 60, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selected.size === 0 ? (
            <span style={{ color: COLORS.textSecondary, fontSize: 13, padding: '8px 2px' }}>
              Select tags to find matching thoughts.
            </span>
          ) : loading ? (
            <span style={{ color: COLORS.textSecondary, fontSize: 13, padding: '8px 2px' }}>
              <span className="spinner" style={{ marginRight: 8 }} />
              searching…
            </span>
          ) : matches.length === 0 ? (
            <span style={{ color: COLORS.textSecondary, fontSize: 13, padding: '8px 2px' }}>No matches.</span>
          ) : (
            matches.map((m) => (
              <button
                key={`${m.treeId}:${m.nodeId}`}
                onClick={() => {
                  onOpenNode(m.treeId, m.nodeId);
                  onClose();
                }}
                style={{
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  color: COLORS.text,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 10, fontFamily: FONTS.mono, color: COLORS.textSecondary, marginBottom: 3 }}>
                  {m.treeTitle}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {m.content.split('\n')[0] || '(empty)'}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
