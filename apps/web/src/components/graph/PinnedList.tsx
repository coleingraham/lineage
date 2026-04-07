import type { Tree } from '@lineage/core';
import { FONTS, nodeColor } from '../../styles/theme.js';
import type { GraphNode, PinnedNode } from './GraphRendererTypes.js';
import { RoleIcon, previewContent } from './NodeCardShared.js';

export function PinnedList({
  pinnedNodes,
  currentTreeNodes,
  currentTreeId,
  onSelect,
  onSelectTree,
  onUnpin,
  onClearAll,
  trees,
}: {
  pinnedNodes: PinnedNode[];
  currentTreeNodes: GraphNode[];
  currentTreeId: string | null;
  onSelect: (nodeId: string) => void;
  onSelectTree: (treeId: string) => void;
  onUnpin: (nodeId: string) => void;
  onClearAll: () => void;
  trees: Tree[];
}) {
  const nodeById = new Map(currentTreeNodes.map((n) => [n.id, n]));
  const treeById = new Map(trees.map((t) => [t.treeId, t]));

  if (pinnedNodes.length === 0) {
    return (
      <div
        style={{
          padding: '20px 14px',
          fontSize: '11px',
          color: '#333',
          fontFamily: FONTS.mono,
          textAlign: 'center',
        }}
      >
        No pinned nodes
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
      <button
        onClick={onClearAll}
        style={{
          display: 'block',
          width: '100%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '4px',
          color: '#555',
          fontSize: '9px',
          fontFamily: FONTS.mono,
          letterSpacing: '0.06em',
          padding: '5px 0',
          cursor: 'pointer',
          marginBottom: '6px',
        }}
      >
        CLEAR ALL
      </button>
      {pinnedNodes.map((pin) => {
        const inCurrentTree = pin.treeId === currentTreeId;
        const node = inCurrentTree ? nodeById.get(pin.nodeId) : undefined;
        const tree = treeById.get(pin.treeId);
        const c = node ? nodeColor(node.type, node.isDeleted) : '#555';

        return (
          <div
            key={pin.nodeId}
            onClick={() => {
              if (inCurrentTree) {
                onSelect(pin.nodeId);
              } else {
                onSelectTree(pin.treeId);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              padding: '8px 6px',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: inCurrentTree ? 1 : 0.45,
              transition: 'background 0.1s',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <div style={{ flexShrink: 0, marginTop: '1px' }}>
              {node ? (
                <RoleIcon role={node.type} size={14} />
              ) : (
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '3px',
                    background: '#333',
                    flexShrink: 0,
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {!inCurrentTree && tree && (
                <div
                  style={{
                    fontSize: '8px',
                    color: '#444',
                    fontFamily: FONTS.mono,
                    letterSpacing: '0.06em',
                    marginBottom: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tree.title || 'Untitled'}
                </div>
              )}
              <div
                style={{
                  fontSize: '10px',
                  color: inCurrentTree ? '#999' : '#555',
                  fontFamily: FONTS.mono,
                  lineHeight: '1.4',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {node ? previewContent(node.content).slice(0, 120) || '(empty)' : '(other tree)'}
              </div>
              {node && (
                <div
                  style={{
                    fontSize: '8px',
                    color: c,
                    fontFamily: FONTS.mono,
                    marginTop: '2px',
                    letterSpacing: '0.06em',
                  }}
                >
                  {node.type.toUpperCase()} · depth {node.depth}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnpin(pin.nodeId);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#444',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '0 2px',
                flexShrink: 0,
                lineHeight: 1,
              }}
              title="Unpin"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
