import { useState, useMemo } from 'react';
import { FONTS, nodeColor } from '../../styles/theme.js';
import { getAncestorIds } from './graphUtils.js';
import type { FlatNode } from './graphUtils.js';

/**
 * Build the ancestor path from root (or lowest summary ancestor) to the given node.
 */
function getHoverPath(nodes: FlatNode[], nodeId: string): string[] {
  const ancestors = getAncestorIds(nodes, nodeId);
  // Find the lowest summary node in the path and start from there
  let startIdx = 0;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = nodes.find((n) => n.id === ancestors[i]);
    if (node?.type === 'summary') {
      startIdx = i;
      break;
    }
  }
  return ancestors.slice(startIdx);
}

export function VerticalMinimap({
  flat,
  selected,
  onSelect,
}: {
  flat: FlatNode[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const activePath = useMemo(
    () => (selected ? getAncestorIds(flat, selected) : []),
    [flat, selected],
  );

  // Index of the lowest summary node on the active path — nodes before
  // this are "superseded" and rendered dimmer.
  const summaryBreakIdx = useMemo(() => {
    for (let i = activePath.length - 1; i >= 0; i--) {
      const node = flat.find((n) => n.id === activePath[i]);
      if (node?.type === 'summary') return i;
    }
    return -1;
  }, [activePath, flat]);

  const hoverPath = useMemo(
    () => (hoveredNodeId ? getHoverPath(flat, hoveredNodeId) : []),
    [flat, hoveredNodeId],
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
        onMouseLeave={() => setHoveredNodeId(null)}
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
          const childIdx = activePath.indexOf(n.id);
          const isActive = childIdx !== -1 && activePath.includes(n.parentId);
          const isSuperseded = isActive && summaryBreakIdx !== -1 && childIdx <= summaryBreakIdx;
          const isHover =
            !isActive && hoverPath.includes(n.id) && hoverPath.includes(n.parentId);
          return (
            <line
              key={n.id + '-e'}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={
                isActive
                  ? `${nodeColor(n.type, n.isDeleted)}${isSuperseded ? '25' : '66'}`
                  : isHover
                    ? `${nodeColor(n.type, n.isDeleted)}44`
                    : 'rgba(255,255,255,0.05)'
              }
              strokeWidth={isActive ? (isSuperseded ? 1 : 1.5) : isHover ? 1.2 : 0.8}
            />
          );
        })}

        {/* Nodes */}
        {flat.map((n) => {
          const pos = positions[n.id];
          if (!pos) return null;
          const isSel = n.id === selected;
          const pathIdx = activePath.indexOf(n.id);
          const isPath = pathIdx !== -1;
          const isSuperseded = isPath && summaryBreakIdx !== -1 && pathIdx < summaryBreakIdx;
          const isHover = !isPath && hoverPath.includes(n.id);
          const c = nodeColor(n.type, n.isDeleted);
          return (
            <g
              key={n.id}
              onClick={() => onSelect(n.id)}
              onMouseEnter={() => setHoveredNodeId(n.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible hit area */}
              <circle cx={pos.x} cy={pos.y} r={8} fill="transparent" />
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
                r={isSel ? 3.5 : isPath || isHover ? 2.5 : 2}
                fill={
                  isSel
                    ? c
                    : isPath
                      ? c + (isSuperseded ? '44' : 'aa')
                      : isHover
                        ? c + '77'
                        : 'rgba(255,255,255,0.1)'
                }
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
