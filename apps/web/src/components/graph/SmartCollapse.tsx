import { useState, useMemo } from 'react';
import { FONTS, nodeColor } from '../../styles/theme.js';
import { Dot, previewContent } from './NodeCardShared.js';
import { getAncestorIds } from './graphUtils.js';
import type { FlatNode } from './graphUtils.js';

export function SmartCollapse({
  flat,
  rootNode,
  selected,
  onSelect,
}: {
  flat: FlatNode[];
  rootNode: FlatNode | undefined;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const activePath = useMemo(
    () => (selected ? getAncestorIds(flat, selected) : []),
    [flat, selected],
  );
  const [manualExpanded, setManualExpanded] = useState(new Set<string>());

  function toggle(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setManualExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function renderNode(node: FlatNode, depth: number): React.ReactNode {
    const isOnPath = activePath.includes(node.id);
    const isSelected = node.id === selected;
    const hasChildren = node._children.length > 0;
    const isExpanded = isOnPath || manualExpanded.has(node.id);
    const c = nodeColor(node.type, node.isDeleted);

    return (
      <div key={node.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '7px 6px',
            paddingLeft: `${6 + depth * 13}px`,
            borderRadius: '4px',
            cursor: 'pointer',
            background: isSelected ? 'rgba(143,184,200,0.07)' : 'transparent',
            borderLeft: `2px solid ${isSelected ? c : 'transparent'}`,
          }}
        >
          <span
            onClick={(e) => (hasChildren ? toggle(e, node.id) : null)}
            style={{
              fontSize: '10px',
              color: isOnPath ? '#454545' : '#252525',
              width: 14,
              textAlign: 'center',
              flexShrink: 0,
              lineHeight: 1,
              visibility: hasChildren ? 'visible' : 'hidden',
            }}
          >
            {isExpanded ? '▾' : '▸'}
          </span>
          <div
            onClick={() => onSelect(node.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <Dot type={node.type} isDeleted={node.isDeleted} size={6} glow={isSelected} />
            <span
              style={{
                fontSize: '12px',
                fontFamily: FONTS.mono,
                color: isSelected ? '#d0d0d0' : isOnPath ? '#5a5a5a' : '#2e2e2e',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.4,
              }}
            >
              {previewContent(node.content) || '(root)'}
            </span>
          </div>
        </div>
        {isExpanded &&
          hasChildren &&
          node._children.map((child) => {
            const childFlat = flat.find((f) => f.id === child.id);
            return childFlat ? renderNode(childFlat, depth + 1) : null;
          })}
      </div>
    );
  }

  if (!rootNode) return null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 4px' }}>{renderNode(rootNode, 0)}</div>
  );
}
