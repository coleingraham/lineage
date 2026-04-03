import { useState, useMemo } from 'react';
import { FONTS, nodeColor } from '../../styles/theme.js';
import type { GraphNode } from './GraphRendererTypes.js';
import { Dot } from './NodeCardShared.js';
import { buildFlatList, findRoot, getAncestorIds } from './graphUtils.js';
import type { FlatNode } from './graphUtils.js';

// ── Vertical Minimap ─────────────────────────────────────────────────────────
function VerticalMinimap({
  flat,
  selected,
  onSelect,
}: {
  flat: FlatNode[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const activePath = useMemo(
    () => (selected ? getAncestorIds(flat, selected) : []),
    [flat, selected],
  );

  const W = 226;
  const PAD = 14;
  const maxDepth = Math.max(...flat.map((n) => n.depth), 0);

  const byDepth = useMemo(() => {
    const map: Record<number, FlatNode[]> = {};
    for (const n of flat) {
      (map[n.depth] ??= []).push(n);
    }
    return map;
  }, [flat]);

  const rowH = 22;
  const H = Math.max(80, (maxDepth + 1) * rowH + PAD * 2);

  const positions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    for (const n of flat) {
      const siblings = byDepth[n.depth];
      const idx = siblings.indexOf(n);
      const total = siblings.length;
      pos[n.id] = {
        x: PAD + ((idx + 0.5) / total) * (W - PAD * 2),
        y: PAD + (n.depth / Math.max(1, maxDepth)) * (H - PAD * 2),
      };
    }
    return pos;
  }, [flat, byDepth, maxDepth, H]);

  return (
    <div
      style={{
        margin: '0 8px 0',
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '6px',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '6px 10px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: '9px',
            color: '#2e2e2e',
            letterSpacing: '0.1em',
            fontFamily: FONTS.mono,
          }}
        >
          STRUCTURE MAP
        </span>
        <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
          {flat.length} nodes
        </span>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        {/* Depth row guides */}
        {Object.keys(byDepth).map((depth) => {
          const d = parseInt(depth);
          const y = PAD + (d / Math.max(1, maxDepth)) * (H - PAD * 2);
          return (
            <line
              key={`guide-${d}`}
              x1={PAD}
              y1={y}
              x2={W - PAD}
              y2={y}
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="1"
            />
          );
        })}

        {/* Edges */}
        {flat.map((n) => {
          if (!n.parentId) return null;
          const from = positions[n.parentId];
          const to = positions[n.id];
          if (!from || !to) return null;
          const isActive = activePath.includes(n.id) && activePath.includes(n.parentId);
          return (
            <line
              key={n.id + '-e'}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={
                isActive
                  ? `${nodeColor(n.type, n.isDeleted)}66`
                  : 'rgba(255,255,255,0.05)'
              }
              strokeWidth={isActive ? 1.5 : 0.8}
            />
          );
        })}

        {/* Nodes */}
        {flat.map((n) => {
          const pos = positions[n.id];
          if (!pos) return null;
          const isSel = n.id === selected;
          const isPath = activePath.includes(n.id);
          const c = nodeColor(n.type, n.isDeleted);
          return (
            <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: 'pointer' }}>
              {isSel && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={6}
                  fill={c + '18'}
                  stroke={c + '44'}
                  strokeWidth={1}
                />
              )}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isSel ? 3.5 : isPath ? 2.5 : 2}
                fill={isSel ? c : isPath ? c + 'aa' : 'rgba(255,255,255,0.1)'}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Drill-down focus slice ───────────────────────────────────────────────────
function DrilldownSlice({
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
                {(anc.content || '(root)').slice(0, 24)}
                {(anc.content || '').length > 24 ? '…' : ''}
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
                {sib.content || '(empty)'}
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
                  {ch.content || '(empty)'}
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

// ── Smart collapse ───────────────────────────────────────────────────────────
function SmartCollapse({
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
              {node.content || '(root)'}
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
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 4px' }}>
      {renderNode(rootNode, 0)}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar({
  nodes,
  selectedNodeId,
  onSelect,
}: {
  nodes: GraphNode[];
  selectedNodeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<'focus' | 'power'>('focus');
  const flat = useMemo(() => buildFlatList(nodes), [nodes]);
  const rootNode = useMemo(() => {
    const root = findRoot(nodes);
    return root ? flat.find((f) => f.id === root.id) : undefined;
  }, [nodes, flat]);
  const selectedNode = flat.find((n) => n.id === selectedNodeId);
  const maxDepth = Math.max(...flat.map((n) => n.depth), 0);

  return (
    <div
      style={{
        width: '258px',
        flexShrink: 0,
        background: '#0a0b0e',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 14px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="4" r="2.5" fill="#e2c97e" />
          <circle cx="4" cy="14" r="2.5" fill="#8fb8c8" />
          <circle cx="18" cy="14" r="2.5" fill="#7ec8a0" />
          <line
            x1="11"
            y1="6.5"
            x2="4"
            y2="11.5"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1.2"
          />
          <line
            x1="11"
            y1="6.5"
            x2="18"
            y2="11.5"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1.2"
          />
        </svg>
        <span style={{ fontSize: '12px', letterSpacing: '0.12em', color: '#c8c8c8' }}>
          LINEAGE
        </span>

        {/* Mode toggle */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '5px',
            overflow: 'hidden',
          }}
        >
          {(
            [
              { id: 'focus', label: 'Focus' },
              { id: 'power', label: '⚡' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                background:
                  mode === m.id ? 'rgba(143,184,200,0.15)' : 'transparent',
                border: 'none',
                color: mode === m.id ? '#8fb8c8' : '#333',
                padding: '4px 9px',
                fontSize: '10px',
                cursor: 'pointer',
                fontFamily: FONTS.mono,
                transition: 'all 0.15s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mode label */}
      <div
        style={{
          padding: '6px 14px 4px',
          fontSize: '9px',
          color: '#252525',
          letterSpacing: '0.1em',
          fontFamily: FONTS.mono,
          flexShrink: 0,
        }}
      >
        {mode === 'focus' ? 'FOCUS VIEW — DRILL DOWN' : 'POWER VIEW — MAP + TREE'}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          paddingTop: '2px',
        }}
      >
        {mode === 'focus' && (
          <DrilldownSlice flat={flat} selected={selectedNodeId} onSelect={onSelect} />
        )}
        {mode === 'power' && (
          <>
            <VerticalMinimap flat={flat} selected={selectedNodeId} onSelect={onSelect} />
            <div
              style={{
                height: '1px',
                background: 'rgba(255,255,255,0.04)',
                margin: '0 8px',
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontSize: '9px',
                color: '#252525',
                letterSpacing: '0.1em',
                padding: '0 14px 2px',
                fontFamily: FONTS.mono,
                flexShrink: 0,
              }}
            >
              TREE
            </div>
            <SmartCollapse
              flat={flat}
              rootNode={rootNode}
              selected={selectedNodeId}
              onSelect={onSelect}
            />
          </>
        )}
      </div>

      {/* Depth bar */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          gap: '3px',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '9px',
            color: '#252525',
            marginRight: '5px',
            letterSpacing: '0.06em',
            fontFamily: FONTS.mono,
          }}
        >
          DEPTH
        </span>
        {Array.from({ length: Math.max(7, maxDepth + 1) }, (_, d) => {
          const selDepth = selectedNode?.depth ?? 0;
          const c = selectedNode ? nodeColor(selectedNode.type, selectedNode.isDeleted) : '#8fb8c8';
          return (
            <div
              key={d}
              style={{
                width: 16,
                height: 3,
                borderRadius: '2px',
                background: d <= selDepth ? c : 'rgba(255,255,255,0.05)',
                opacity: d <= selDepth ? 1 - d * 0.08 : 1,
                transition: 'all 0.2s ease',
              }}
            />
          );
        })}
        <span
          style={{
            fontSize: '9px',
            color: '#333',
            marginLeft: '4px',
            fontFamily: FONTS.mono,
          }}
        >
          {selectedNode?.depth ?? 0}
        </span>
      </div>
    </div>
  );
}
