import { FONTS, nodeColor } from '../../styles/theme.js';
import type { GraphNode } from './GraphRendererTypes.js';
import { Dot, nodeLabel, previewContent } from './NodeCardShared.js';

export function ParentCard({
  node,
  onSelect,
}: {
  node: GraphNode;
  onSelect: (id: string) => void;
}) {
  const c = nodeColor(node.type, node.isDeleted);
  return (
    <div
      onClick={() => onSelect(node.id)}
      style={{
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderLeft: `3px solid ${c}28`,
        borderRadius: '8px',
        padding: '14px 20px',
        cursor: 'pointer',
        opacity: 0.7,
        transition: 'opacity 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: '9px',
              color: '#2e2e2e',
              letterSpacing: '0.1em',
              fontFamily: FONTS.mono,
              flexShrink: 0,
            }}
          >
            ↑ PARENT
          </span>
          <Dot type={node.type} isDeleted={node.isDeleted} size={5} />
          <span
            style={{
              fontSize: '13px',
              fontFamily: FONTS.serif,
              fontWeight: 400,
              color: '#5a5a5a',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {previewContent(node.content) || '(empty)'}
          </span>
        </div>
        <span
          style={{
            fontSize: '9px',
            color: c + '66',
            fontFamily: FONTS.mono,
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}
        >
          {nodeLabel(node)}
        </span>
      </div>
    </div>
  );
}
