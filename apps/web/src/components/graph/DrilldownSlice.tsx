import { useMemo } from 'react';
import { FONTS, nodeColor } from '../../styles/theme.js';
import { Dot, previewContent } from './NodeCardShared.js';
import { getAncestorIds } from './graphUtils.js';
import type { FlatNode } from './graphUtils.js';

export function DrilldownSlice({
  flat,
  selected,
  onSelect,
}: {
  flat: FlatNode[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const ancestors = useMemo(
    () => (selected ? getAncestorIds(flat, selected) : []),
    [flat, selected],
  );
  const selectedNode = flat.find((n) => n.id === selected);
  const siblings = flat.filter((n) => n.parentId === selectedNode?.parentId);
  const children = flat.filter((n) => n.parentId === selected);
  const ancestorNodes = ancestors.slice(0, -1).map((id) => flat.find((n) => n.id === id)!);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Ancestor pills */}
      {ancestorNodes.length > 0 && (
        <div
          style={{
            padding: '6px 8px 4px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            flexShrink: 0,
          }}
        >
          {ancestorNodes.map((anc, i) => (
            <div
              key={anc.id}
              onClick={() => onSelect(anc.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                paddingLeft: `${8 + i * 8}px`,
                cursor: 'pointer',
                borderRadius: '3px',
                transition: 'background 0.1s',
              }}
            >
              <svg
                width="7"
                height="7"
                viewBox="0 0 8 8"
                fill="none"
                style={{ opacity: 0.25, flexShrink: 0 }}
              >
                <path d="M2 0 L2 4 L8 4" stroke="#8fb8c8" strokeWidth="1.2" />
              </svg>
              <Dot type={anc.type} isDeleted={anc.isDeleted} size={4} />
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: FONTS.mono,
                  color: '#383838',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {(previewContent(anc.content) || '(root)').slice(0, 24)}
                {(previewContent(anc.content) || '').length > 24 ? '…' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Scrollable slice */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        <div
          style={{
            fontSize: '9px',
            color: '#252525',
            letterSpacing: '0.1em',
            padding: '4px 8px 4px',
            fontFamily: FONTS.mono,
          }}
        >
          {selectedNode?.parentId ? 'SIBLINGS' : 'ROOT'}
        </div>
        {siblings.map((sib) => {
          const isSelected = sib.id === selected;
          const c = nodeColor(sib.type, sib.isDeleted);
          return (
            <div
              key={sib.id}
              onClick={() => onSelect(sib.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '5px',
                cursor: 'pointer',
                background: isSelected ? 'rgba(143,184,200,0.07)' : 'transparent',
                borderLeft: `2px solid ${isSelected ? c : 'transparent'}`,
                transition: 'all 0.12s',
              }}
            >
              <Dot type={sib.type} isDeleted={sib.isDeleted} size={6} glow={isSelected} />
              <span
                style={{
                  fontSize: '12px',
                  fontFamily: FONTS.mono,
                  color: isSelected ? '#d0d0d0' : '#666',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {previewContent(sib.content) || '(empty)'}
              </span>
              {sib._children.length > 0 && !isSelected && (
                <span style={{ fontSize: '9px', color: '#2a2a2a', flexShrink: 0 }}>
                  ↓{sib._children.length}
                </span>
              )}
            </div>
          );
        })}

        {children.length > 0 && (
          <>
            <div
              style={{
                fontSize: '9px',
                color: '#252525',
                letterSpacing: '0.1em',
                padding: '8px 8px 4px',
                fontFamily: FONTS.mono,
                borderTop: '1px solid rgba(255,255,255,0.04)',
                marginTop: '4px',
              }}
            >
              CHILDREN
            </div>
            {children.map((ch) => (
              <div
                key={ch.id}
                onClick={() => onSelect(ch.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  paddingLeft: '20px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  background: 'transparent',
                  borderLeft: '2px solid transparent',
                  transition: 'all 0.12s',
                }}
              >
                <svg
                  width="7"
                  height="7"
                  viewBox="0 0 8 8"
                  fill="none"
                  style={{ opacity: 0.2, flexShrink: 0 }}
                >
                  <path d="M2 0 L2 4 L8 4" stroke="#8fb8c8" strokeWidth="1.2" />
                </svg>
                <Dot type={ch.type} isDeleted={ch.isDeleted} size={6} />
                <span
                  style={{
                    fontSize: '12px',
                    fontFamily: FONTS.mono,
                    color: '#4e4e4e',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    lineHeight: 1.4,
                  }}
                >
                  {previewContent(ch.content) || '(empty)'}
                </span>
                {ch._children.length > 0 && (
                  <span style={{ fontSize: '9px', color: '#2a2a2a', flexShrink: 0 }}>
                    ↓{ch._children.length}
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
