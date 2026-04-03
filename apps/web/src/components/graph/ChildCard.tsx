import { FONTS, nodeColor } from '../../styles/theme.js';
import type { GraphNode } from './GraphRendererTypes.js';
import { Dot, nodeLabel } from './NodeCardShared.js';

export function ChildCard({ node, onSelect }: { node: GraphNode; onSelect: (id: string) => void }) {
  const c = nodeColor(node.type, node.isDeleted);
  return (
    <div
      onClick={() => onSelect(node.id)}
      style={{
        background: node.isDeleted ? 'rgba(255,255,255,0.008)' : 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderLeft: `3px solid ${c}28`,
        borderRadius: '8px',
        padding: '14px 20px',
        marginBottom: '6px',
        cursor: 'pointer',
        opacity: node.isDeleted ? 0.35 : 0.75,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!node.isDeleted) e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = node.isDeleted ? '0.35' : '0.75';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <Dot type={node.type} isDeleted={node.isDeleted} size={5} />
          <span
            style={{
              fontSize: '13px',
              fontFamily: FONTS.serif,
              fontWeight: 400,
              color: node.isDeleted ? '#444' : '#707070',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: node.isDeleted ? 'line-through' : 'none',
            }}
          >
            {node.content || '(empty)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {node.childCount > 0 && (
            <span style={{ fontSize: '9px', color: '#2a2a2a', fontFamily: FONTS.mono }}>
              ↓{node.childCount}
            </span>
          )}
          <span
            style={{
              fontSize: '9px',
              color: c + '55',
              fontFamily: FONTS.mono,
              letterSpacing: '0.06em',
            }}
          >
            {nodeLabel(node)}
          </span>
        </div>
      </div>
    </div>
  );
}
