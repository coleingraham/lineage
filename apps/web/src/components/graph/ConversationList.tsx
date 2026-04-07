import { useState, useCallback } from 'react';
import type { Tree, NodeRepository } from '@lineage/core';
import { FONTS } from '../../styles/theme.js';

export function ConversationList({
  trees,
  selectedTreeId,
  onSelectTree,
  onDeleteTree,
  repo,
  onTreeCreated,
  onRequestEdit,
}: {
  trees: Tree[];
  selectedTreeId: string | null;
  onSelectTree: (treeId: string) => void;
  onDeleteTree: (treeId: string) => void;
  repo: NodeRepository;
  onTreeCreated: () => void;
  onRequestEdit: (nodeId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const handleRenameStart = useCallback((treeId: string, currentTitle: string) => {
    setEditingTitleId(treeId);
    setEditingTitle(currentTitle);
  }, []);

  const handleRenameSave = useCallback(async () => {
    if (!editingTitleId) return;
    const tree = trees.find((t) => t.treeId === editingTitleId);
    if (tree) {
      try {
        await repo.putTree({ ...tree, title: editingTitle });
        onTreeCreated(); // refresh tree list
      } catch (e) {
        console.error('[ConversationList] rename failed', e);
      }
    }
    setEditingTitleId(null);
    setEditingTitle('');
  }, [editingTitleId, editingTitle, trees, repo, onTreeCreated]);

  const handleRenameCancel = useCallback(() => {
    setEditingTitleId(null);
    setEditingTitle('');
  }, []);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const title = 'New Conversation';
      const treeId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      await repo.putTree({ treeId, title, createdAt, rootNodeId, contextSources: null });
      await repo.putNode({
        nodeId: rootNodeId,
        treeId,
        parentId: null,
        type: 'human',
        content: '',
        isDeleted: false,
        createdAt,
        modelName: null,
        provider: null,
        tokenCount: null,
        embeddingModel: null,
        metadata: null,
        author: null,
      });

      onSelectTree(treeId);
      onRequestEdit(rootNodeId);
      onTreeCreated();
    } catch (e) {
      console.error('[ConversationList] create failed', e);
    } finally {
      setCreating(false);
    }
  }, [creating, trees.length, repo, onTreeCreated, onSelectTree, onRequestEdit]);

  const confirmDelete = useCallback(
    (treeId: string) => {
      onDeleteTree(treeId);
      setConfirmingDeleteId(null);
    },
    [onDeleteTree],
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px', flexShrink: 0 }}>
        <button
          onClick={handleCreate}
          disabled={creating}
          style={{
            width: '100%',
            background: 'rgba(143,184,200,0.08)',
            border: '1px solid rgba(143,184,200,0.15)',
            borderRadius: '5px',
            padding: '8px',
            cursor: creating ? 'default' : 'pointer',
            fontFamily: FONTS.mono,
            fontSize: '11px',
            color: '#8fb8c8',
            letterSpacing: '0.06em',
            opacity: creating ? 0.5 : 1,
          }}
        >
          + New Conversation
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px' }}>
        {[...trees]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((tree) => {
            const isSelected = tree.treeId === selectedTreeId;
            return (
              <div
                key={tree.treeId}
                onClick={() => onSelectTree(tree.treeId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 10px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(143,184,200,0.07)' : 'transparent',
                  borderLeft: `2px solid ${isSelected ? '#8fb8c8' : 'transparent'}`,
                  transition: 'all 0.12s',
                }}
              >
                {editingTitleId === tree.treeId ? (
                  <input
                    autoFocus
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSave();
                      if (e.key === 'Escape') handleRenameCancel();
                    }}
                    onBlur={handleRenameCancel}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      fontFamily: FONTS.mono,
                      color: '#d0d0d0',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(143,184,200,0.3)',
                      borderRadius: '3px',
                      padding: '2px 6px',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      fontFamily: FONTS.mono,
                      color: isSelected ? '#d0d0d0' : '#666',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tree.title || tree.treeId.slice(0, 8)}
                  </span>
                )}
                {confirmingDeleteId === tree.treeId ? (
                  <div
                    style={{ display: 'flex', gap: '4px', flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => confirmDelete(tree.treeId)}
                      style={{
                        background: 'rgba(238,85,85,0.15)',
                        border: '1px solid rgba(238,85,85,0.3)',
                        borderRadius: '3px',
                        color: '#e55',
                        cursor: 'pointer',
                        fontSize: '9px',
                        padding: '2px 6px',
                        fontFamily: FONTS.mono,
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '3px',
                        color: '#666',
                        cursor: 'pointer',
                        fontSize: '9px',
                        padding: '2px 6px',
                        fontFamily: FONTS.mono,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  editingTitleId !== tree.treeId && (
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameStart(tree.treeId, tree.title || '');
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#444',
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: '2px 4px',
                          fontFamily: FONTS.mono,
                          opacity: 0.6,
                        }}
                        title="Rename conversation"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmingDeleteId(tree.treeId);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#444',
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: '2px 4px',
                          fontFamily: FONTS.mono,
                          opacity: 0.6,
                        }}
                        title="Delete conversation"
                      >
                        ✕
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
