import { useState } from 'react';
import type { NodeRepository } from '@lineage/core';
import { COLORS, FONTS } from '../styles/theme.js';
import { useTagging } from '../hooks/useTagging.js';

/* ── Styles ────────────────────────────────────────────────────────── */

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 200,
};

const panel: React.CSSProperties = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '8px',
  width: '620px',
  maxHeight: '80vh',
  overflowY: 'auto',
  padding: '24px 28px',
  fontFamily: FONTS.mono,
  fontSize: '12px',
  color: COLORS.text,
};

const heading: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  fontFamily: FONTS.mono,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.border}`,
  paddingBottom: '8px',
  marginBottom: '16px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '4px',
  padding: '6px 8px',
  fontFamily: FONTS.mono,
  fontSize: '11px',
  color: COLORS.text,
  outline: 'none',
  boxSizing: 'border-box',
};

const btnSmall: React.CSSProperties = {
  fontFamily: FONTS.mono,
  fontSize: '10px',
  letterSpacing: '0.04em',
  border: 'none',
  borderRadius: '3px',
  padding: '4px 10px',
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.06)',
  color: COLORS.textSecondary,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 8px',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background 0.1s',
};

interface TagManagerProps {
  repo: NodeRepository;
  onClose: () => void;
}

export function TagManager({ repo, onClose }: TagManagerProps) {
  const {
    categories,
    createCategory,
    updateCategory,
    deleteCategory,
    createTag,
    updateTag,
    deleteTag,
    tagsForCategory,
  } = useTagging(repo);

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagDesc, setNewTagDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = categories.find((c) => c.categoryId === selectedCategoryId);
  const selectedTags = selectedCategoryId ? tagsForCategory(selectedCategoryId) : [];

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setError(null);
    try {
      const cat = await createCategory(newCategoryName.trim());
      setNewCategoryName('');
      if (cat) setSelectedCategoryId(cat.categoryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setError(null);
    try {
      await deleteCategory(id);
      if (selectedCategoryId === id) setSelectedCategoryId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim() || !selectedCategoryId) return;
    setError(null);
    try {
      await createTag(selectedCategoryId, newTagName.trim(), newTagDesc.trim());
      setNewTagName('');
      setNewTagDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tag');
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    setError(null);
    try {
      await deleteTag(tagId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
    }
  };

  const handleStartEdit = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  };

  const handleSaveEdit = async (id: string, type: 'category' | 'tag') => {
    if (!editValue.trim()) return;
    setError(null);
    try {
      if (type === 'category') {
        await updateCategory(id, { name: editValue.trim() });
      } else {
        await updateTag(id, { name: editValue.trim() });
      }
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h2 style={heading}>Tag Manager</h2>

        {error && (
          <div
            style={{
              background: 'rgba(238,85,85,0.1)',
              border: '1px solid rgba(238,85,85,0.3)',
              borderRadius: '4px',
              padding: '8px 12px',
              marginBottom: '16px',
              fontSize: '11px',
              color: '#e55',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '20px', minHeight: '300px' }}>
          {/* Left column: Categories */}
          <div
            style={{
              width: '200px',
              borderRight: `1px solid ${COLORS.border}`,
              paddingRight: '16px',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: COLORS.textSecondary,
                marginBottom: '8px',
              }}
            >
              Categories
            </div>

            {categories.map((cat) => (
              <div
                key={cat.categoryId}
                style={{
                  ...rowStyle,
                  background:
                    selectedCategoryId === cat.categoryId
                      ? 'rgba(255,255,255,0.06)'
                      : 'transparent',
                }}
                onClick={() => setSelectedCategoryId(cat.categoryId)}
              >
                {editingId === cat.categoryId ? (
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(cat.categoryId, 'category');
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={() => handleSaveEdit(cat.categoryId, 'category')}
                    autoFocus
                    style={{ ...inputStyle, width: '120px', padding: '2px 4px', fontSize: '11px' }}
                  />
                ) : (
                  <span
                    style={{ flex: 1, fontSize: '11px' }}
                    onDoubleClick={() => handleStartEdit(cat.categoryId, cat.name)}
                  >
                    {cat.name}
                  </span>
                )}
                <span style={{ fontSize: '9px', color: COLORS.textSecondary }}>
                  {tagsForCategory(cat.categoryId).length}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCategory(cat.categoryId);
                  }}
                  style={{
                    ...btnSmall,
                    padding: '2px 6px',
                    fontSize: '9px',
                    color: '#e55',
                    background: 'transparent',
                  }}
                  title="Delete category"
                >
                  x
                </button>
              </div>
            ))}

            {/* Add category */}
            <div style={{ marginTop: '12px', display: 'flex', gap: '4px' }}>
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                placeholder="New category..."
                style={{ ...inputStyle, flex: 1, fontSize: '10px' }}
              />
              <button onClick={handleCreateCategory} style={btnSmall}>
                +
              </button>
            </div>
          </div>

          {/* Right column: Tags for selected category */}
          <div style={{ flex: 1 }}>
            {selectedCategory ? (
              <>
                <div
                  style={{
                    fontSize: '10px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: COLORS.textSecondary,
                    marginBottom: '8px',
                  }}
                >
                  Tags in {selectedCategory.name}
                </div>

                {selectedTags.map((tag) => (
                  <div key={tag.tagId} style={{ ...rowStyle, cursor: 'default' }}>
                    {editingId === tag.tagId ? (
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(tag.tagId, 'tag');
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => handleSaveEdit(tag.tagId, 'tag')}
                        autoFocus
                        style={{
                          ...inputStyle,
                          width: '120px',
                          padding: '2px 4px',
                          fontSize: '11px',
                        }}
                      />
                    ) : (
                      <span
                        style={{ flex: 1, fontSize: '11px' }}
                        onDoubleClick={() => handleStartEdit(tag.tagId, tag.name)}
                      >
                        {tag.name}
                      </span>
                    )}
                    {tag.description && (
                      <span
                        style={{
                          fontSize: '9px',
                          color: COLORS.textSecondary,
                          maxWidth: '160px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tag.description}
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteTag(tag.tagId)}
                      style={{
                        ...btnSmall,
                        padding: '2px 6px',
                        fontSize: '9px',
                        color: '#e55',
                        background: 'transparent',
                      }}
                      title="Delete tag"
                    >
                      x
                    </button>
                  </div>
                ))}

                {/* Add tag */}
                <div
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    gap: '4px',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                      placeholder="Tag name..."
                      style={{ ...inputStyle, flex: 1, fontSize: '10px' }}
                    />
                    <button onClick={handleCreateTag} style={btnSmall}>
                      +
                    </button>
                  </div>
                  <input
                    value={newTagDesc}
                    onChange={(e) => setNewTagDesc(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                    placeholder="Description (optional)..."
                    style={{ ...inputStyle, fontSize: '10px' }}
                  />
                </div>
              </>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: COLORS.textSecondary,
                  fontSize: '11px',
                }}
              >
                Select a category
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            onClick={onClose}
            style={{
              ...btnSmall,
              padding: '8px 18px',
              fontSize: '11px',
              background: 'rgba(255,255,255,0.08)',
              color: COLORS.text,
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
