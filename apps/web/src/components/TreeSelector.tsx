import { useState, useCallback } from 'react';
import type { Tree, NodeRepository } from '@lineage/core';
import { COLORS, FONTS } from '../styles/theme.js';

interface TreeSelectorProps {
  trees: Tree[];
  selectedTreeId: string | null;
  onSelect: (treeId: string) => void;
  repo: NodeRepository;
  onTreeCreated: () => void;
}

export function TreeSelector({
  trees,
  selectedTreeId,
  onSelect,
  repo,
  onTreeCreated,
}: TreeSelectorProps) {
  const [creating, setCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const title = `Conversation ${trees.length + 1}`;
      const treeId = crypto.randomUUID();
      const rootNodeId = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      const tree: Tree = { treeId, title, createdAt, rootNodeId, contextSources: null };
      await repo.putTree(tree);

      // putTree + putNode for the root (SDK skips root nodes for REST, but
      // the server POST /trees already creates both).  For the browser-sqlite
      // backend we need the root node explicitly.
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

      onTreeCreated();
    } catch (e) {
      console.error('[TreeSelector] create failed', e);
    } finally {
      setCreating(false);
    }
  }, [creating, trees.length, repo, onTreeCreated]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <select
        value={selectedTreeId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '6px',
          padding: '5px 10px',
          fontFamily: FONTS.mono,
          fontSize: '10px',
          color: COLORS.text,
          cursor: 'pointer',
          maxWidth: '200px',
          letterSpacing: '0.06em',
        }}
      >
        {trees.length === 0 && <option value="">No trees</option>}
        {trees.map((t) => (
          <option key={t.treeId} value={t.treeId}>
            {t.title || t.treeId.slice(0, 8)}
          </option>
        ))}
      </select>

      <button
        onClick={handleCreate}
        disabled={creating}
        style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '6px',
          padding: '5px 10px',
          cursor: creating ? 'default' : 'pointer',
          fontFamily: FONTS.mono,
          fontSize: '10px',
          color: COLORS.textSecondary,
          letterSpacing: '0.06em',
          opacity: creating ? 0.5 : 1,
        }}
        title="Create new tree"
      >
        + New
      </button>
    </div>
  );
}
