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
  selectedPinNodeIds,
  onPinSelectionChange,
}: {
  pinnedNodes: PinnedNode[];
  currentTreeNodes: GraphNode[];
  currentTreeId: string | null;
  onSelect: (nodeId: string) => void;
  onSelectTree: (treeId: string) => void;
  onUnpin: (nodeId: string) => void;
  onClearAll: () => void;
  trees: Tree[];
  selectedPinNodeIds: Set<string>;
  onPinSelectionChange: (ids: Set<string>) => void;
}) {
  const nodeById = new Map(currentTreeNodes.map((n) => [n.id, n]));
  const treeById = new Map(trees.map((t) => [t.treeId, t]));

  const allSelected =
    pinnedNodes.length > 0 && pinnedNodes.every((p) => selectedPinNodeIds.has(p.nodeId));
  const noneSelected =
    pinnedNodes.length === 0 || pinnedNodes.every((p) => !selectedPinNodeIds.has(p.nodeId));

  const toggleOne = (nodeId: string) => {
    const next = new Set(selectedPinNodeIds);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    onPinSelectionChange(next);
  };

  const selectAll = () => {
    onPinSelectionChange(new Set(pinnedNodes.map((p) => p.nodeId)));
  };

  const clearSelection = () => {
    onPinSelectionChange(new Set());
  };

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
      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
        <button
          onClick={allSelected ? clearSelection : selectAll}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '4px',
            color: '#555',
            fontSize: '9px',
            fontFamily: FONTS.mono,
            letterSpacing: '0.06em',
            padding: '5px 0',
            cursor: 'pointer',
          }}
        >
          {allSelected ? 'DESELECT ALL' : 'SELECT ALL'}
        </button>
        {!noneSelected && (
          <button
            onClick={clearSelection}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '4px',
              color: '#555',
              fontSize: '9px',
              fontFamily: FONTS.mono,
              letterSpacing: '0.06em',
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            CLEAR
          </button>
        )}
        <button
          onClick={onClearAll}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '4px',
            color: '#555',
            fontSize: '9px',
            fontFamily: FONTS.mono,
            letterSpacing: '0.06em',
            padding: '5px 8px',
            cursor: 'pointer',
          }}
        >
          UNPIN ALL
        </button>
      </div>

      {/* Selection count */}
      {!noneSelected && (
        <div
          style={{
            fontSize: '9px',
            color: '#c8b88a',
            fontFamily: FONTS.mono,
            letterSpacing: '0.06em',
            padding: '0 2px 4px',
          }}
        >
          {selectedPinNodeIds.size} of {pinnedNodes.length} selected
        </div>
      )}

      {pinnedNodes.map((pin) => {
        const inCurrentTree = pin.treeId === currentTreeId;
        const node = inCurrentTree ? nodeById.get(pin.nodeId) : undefined;
        const tree = treeById.get(pin.treeId);
        const c = node ? nodeColor(node.type, node.isDeleted) : '#555';
        const isSelected = selectedPinNodeIds.has(pin.nodeId);

        return (
          <div
            key={pin.nodeId}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              padding: '8px 6px',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: inCurrentTree ? 1 : 0.45,
              transition: 'background 0.1s',
              borderBottom: '1px solid rgba(255,255,255,0.03)',
              background: isSelected ? 'rgba(200,184,138,0.08)' : 'transparent',
              borderLeft: isSelected ? '2px solid #c8b88a' : '2px solid transparent',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = isSelected
                ? 'rgba(200,184,138,0.08)'
                : 'transparent';
            }}
          >
            {/* Checkbox */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                toggleOne(pin.nodeId);
              }}
              style={{
                flexShrink: 0,
                width: 14,
                height: 14,
                marginTop: '1px',
                borderRadius: '3px',
                border: isSelected ? '1px solid #c8b88a' : '1px solid rgba(255,255,255,0.15)',
                background: isSelected ? 'rgba(200,184,138,0.25)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
            >
              {isSelected && (
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                  <path
                    d="M1.5 4L3.2 5.8L6.5 2.2"
                    stroke="#c8b88a"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            {/* Content area — click navigates */}
            <div
              onClick={() => {
                if (inCurrentTree) {
                  onSelect(pin.nodeId);
                } else {
                  onSelectTree(pin.treeId);
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
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
