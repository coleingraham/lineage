import { useState, useEffect, useCallback } from 'react';
import type { NodeRepository, Tag } from '@lineage/core';
import { COLORS, FONTS } from '../styles/theme.js';
import { useTagging } from '../hooks/useTagging.js';
import { TagPill } from './TagPill.js';

/* ── Styles ────────────────────────────────────────────────────────── */

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 210,
};

const panel: React.CSSProperties = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '8px',
  width: '380px',
  maxHeight: '70vh',
  overflowY: 'auto',
  padding: '20px 24px',
  fontFamily: FONTS.mono,
  fontSize: '12px',
  color: COLORS.text,
};

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: '12px',
  fontFamily: FONTS.mono,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
  paddingBottom: '8px',
  marginBottom: '12px',
};

const categoryLabel: React.CSSProperties = {
  fontSize: '9px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: COLORS.textSecondary,
  marginBottom: '6px',
  marginTop: '12px',
};

interface TagPickerProps {
  repo: NodeRepository;
  target: { type: 'node'; nodeId: string } | { type: 'tree'; treeId: string };
  onClose: () => void;
  onTagsChanged: () => void;
  onOpenManager?: () => void;
}

export function TagPicker({ repo, target, onClose, onTagsChanged, onOpenManager }: TagPickerProps) {
  const { categories, tagsForCategory } = useTagging(repo);
  const [appliedTagIds, setAppliedTagIds] = useState<Set<string>>(new Set());

  const loadAppliedTags = useCallback(async () => {
    let tags: Tag[];
    if (target.type === 'node') {
      tags = await repo.getNodeTags(target.nodeId);
    } else {
      tags = await repo.getTreeTags(target.treeId);
    }
    setAppliedTagIds(new Set(tags.map((t) => t.tagId)));
  }, [repo, target]);

  useEffect(() => {
    loadAppliedTags();
  }, [loadAppliedTags]);

  const handleToggle = async (tagId: string) => {
    const isApplied = appliedTagIds.has(tagId);
    if (target.type === 'node') {
      if (isApplied) {
        await repo.untagNode(target.nodeId, [tagId]);
      } else {
        await repo.tagNode(target.nodeId, [tagId]);
      }
    } else {
      if (isApplied) {
        await repo.untagTree(target.treeId, [tagId]);
      } else {
        await repo.tagTree(target.treeId, [tagId]);
      }
    }
    // Update local state immediately
    setAppliedTagIds((prev) => {
      const next = new Set(prev);
      if (isApplied) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
    onTagsChanged();
  };

  const hasCategories = categories.length > 0;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h3 style={heading}>Tags for {target.type === 'node' ? 'Node' : 'Tree'}</h3>

        {hasCategories ? (
          categories.map((cat) => {
            const catTags = tagsForCategory(cat.categoryId);
            if (catTags.length === 0) return null;
            return (
              <div key={cat.categoryId}>
                <div style={categoryLabel}>{cat.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {catTags.map((tag) => (
                    <TagPill
                      key={tag.tagId}
                      tag={tag}
                      active={appliedTagIds.has(tag.tagId)}
                      onClick={() => handleToggle(tag.tagId)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              color: COLORS.textSecondary,
              fontSize: '11px',
              padding: '20px 0',
              textAlign: 'center',
            }}
          >
            No tags yet.{' '}
            {onOpenManager && (
              <button
                onClick={() => {
                  onClose();
                  onOpenManager();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: COLORS.ai,
                  cursor: 'pointer',
                  fontFamily: FONTS.mono,
                  fontSize: '11px',
                  textDecoration: 'underline',
                }}
              >
                Create tags
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          {onOpenManager && (
            <button
              onClick={() => {
                onClose();
                onOpenManager();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                fontFamily: FONTS.mono,
                fontSize: '10px',
              }}
            >
              Manage Tags
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              fontFamily: FONTS.mono,
              fontSize: '11px',
              letterSpacing: '0.04em',
              border: 'none',
              borderRadius: '3px',
              padding: '6px 14px',
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.08)',
              color: COLORS.text,
              marginLeft: 'auto',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
