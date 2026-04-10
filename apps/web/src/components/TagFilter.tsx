import { useState, useCallback, useEffect } from 'react';
import type { NodeRepository, Tag, TagCategory } from '@lineage/core';
import { COLORS, FONTS } from '../styles/theme.js';
import { TagPill } from './TagPill.js';

interface TagFilterProps {
  repo: NodeRepository;
  selectedTagIds: Set<string>;
  onSelectionChange: (tagIds: Set<string>) => void;
  refreshKey?: number;
}

export function TagFilter({ repo, selectedTagIds, onSelectionChange, refreshKey }: TagFilterProps) {
  const [categories, setCategories] = useState<TagCategory[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([repo.listCategories(), repo.listTags()]).then(([cats, allTags]) => {
      if (cancelled) return;
      setCategories(cats);
      setTags(allTags);
    });
    return () => {
      cancelled = true;
    };
  }, [repo, refreshKey]);

  const handleToggleTag = useCallback(
    (tagId: string) => {
      const next = new Set(selectedTagIds);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      onSelectionChange(next);
    },
    [selectedTagIds, onSelectionChange],
  );

  const handleClear = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  if (tags.length === 0) return null;

  const hasSelection = selectedTagIds.size > 0;

  return (
    <div style={{ padding: '0 14px 4px', flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          padding: '2px 0',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          style={{
            fontSize: '9px',
            color: hasSelection ? COLORS.ai : '#444',
            letterSpacing: '0.1em',
            fontFamily: FONTS.mono,
            userSelect: 'none',
          }}
        >
          {expanded ? '▾' : '▸'} FILTER
          {hasSelection && ` (${selectedTagIds.size})`}
        </span>
        {hasSelection && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#555',
              cursor: 'pointer',
              fontSize: '10px',
              padding: '0 2px',
              fontFamily: FONTS.mono,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ paddingTop: '4px' }}>
          {categories.map((cat) => {
            const catTags = tags.filter((t) => t.categoryId === cat.categoryId);
            if (catTags.length === 0) return null;
            return (
              <div key={cat.categoryId} style={{ marginBottom: '6px' }}>
                <div
                  style={{
                    fontSize: '8px',
                    color: '#333',
                    letterSpacing: '0.08em',
                    fontFamily: FONTS.mono,
                    marginBottom: '3px',
                    textTransform: 'uppercase',
                  }}
                >
                  {cat.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                  {catTags.map((tag) => (
                    <TagPill
                      key={tag.tagId}
                      tag={tag}
                      size="small"
                      active={selectedTagIds.has(tag.tagId)}
                      onClick={() => handleToggleTag(tag.tagId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
