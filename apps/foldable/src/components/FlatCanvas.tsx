import { useEffect, useMemo, useRef } from 'react';
import type { Node } from '@lineage/core';
import { layoutTree } from '../lib/treeLayout.js';
import { COLORS, FONTS, intentColor } from '../styles/theme.js';

interface FlatCanvasProps {
  nodes: Node[];
  focusId: string;
  onFocus: (nodeId: string) => void;
  /** Focus the node and open the branch-intent picker. */
  onDiverge: (node: Node) => void;
}

const CARD_W = 220;
const CARD_H = 128;
const GAP_X = 30;
const GAP_Y = 54;
const PAD = 28;

/**
 * Flat (unfolded) canvas: a 2D tidy-tree map of the whole monologue with fuller
 * cards and connectors. Tap a card to focus (the shared compose bar appends to
 * it); use ＋ to target a node for a new child, or ⌥ to branch. Pan in both
 * directions; the focused card scrolls into view.
 */
export function FlatCanvas({ nodes, focusId, onFocus, onDiverge }: FlatCanvasProps) {
  const layout = useMemo(() => layoutTree(nodes), [nodes]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<HTMLDivElement>(null);

  const width = PAD * 2 + (layout.maxCol + 1) * (CARD_W + GAP_X);
  const height = PAD * 2 + (layout.maxDepth + 1) * (CARD_H + GAP_Y);

  const left = (col: number) => PAD + col * (CARD_W + GAP_X);
  const top = (depth: number) => PAD + depth * (CARD_H + GAP_Y);

  // Bring the focused card into view when it changes.
  useEffect(() => {
    focusedRef.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [focusId, layout]);

  return (
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
      <div style={{ position: 'relative', width, height }}>
        {/* Connectors */}
        <svg
          width={width}
          height={height}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          aria-hidden
        >
          {nodes.map((node) => {
            if (node.parentId === null) return null;
            const p = layout.pos.get(node.parentId);
            const c = layout.pos.get(node.nodeId);
            if (!p || !c) return null;
            const x1 = left(p.col) + CARD_W / 2;
            const y1 = top(p.depth) + CARD_H;
            const x2 = left(c.col) + CARD_W / 2;
            const y2 = top(c.depth);
            const my = (y1 + y2) / 2;
            return (
              <path
                key={node.nodeId}
                d={`M ${x1} ${y1} C ${x1} ${my} ${x2} ${my} ${x2} ${y2}`}
                fill="none"
                stroke={intentColor(node.intent)}
                strokeOpacity={0.5}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {/* Cards */}
        {nodes.map((node) => {
          const p = layout.pos.get(node.nodeId);
          if (!p) return null;
          const focused = node.nodeId === focusId;
          const isRoot = node.parentId === null;
          const accent = isRoot
            ? COLORS.root
            : node.type === 'ai'
              ? COLORS.ai
              : node.type === 'summary'
                ? COLORS.summary
                : intentColor(node.intent);
          const chip = isRoot
            ? 'root'
            : node.type === 'ai'
              ? 'ai'
              : node.type === 'summary'
                ? 'summary'
                : node.intent && node.intent !== 'sequence'
                  ? node.intent
                  : null;
          return (
            <div
              key={node.nodeId}
              ref={focused ? focusedRef : undefined}
              onClick={() => onFocus(node.nodeId)}
              style={{
                position: 'absolute',
                left: left(p.col),
                top: top(p.depth),
                width: CARD_W,
                height: CARD_H,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                padding: '8px 10px',
                borderLeft: `3px solid ${accent}`,
                border: `1px solid ${focused ? accent : COLORS.border}`,
                borderLeftWidth: 3,
                borderRadius: '0 10px 10px 0',
                background: focused ? COLORS.elevated : COLORS.surface,
                cursor: 'pointer',
                boxShadow: focused ? `0 0 0 1px ${accent}` : 'none',
              }}
            >
              {chip && (
                <div style={{ fontSize: 10, fontFamily: FONTS.mono, color: accent, marginBottom: 3 }}>
                  {chip}
                </div>
              )}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  fontSize: 13,
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: focused ? 4 : 5,
                  overflow: 'hidden',
                  color: COLORS.text,
                }}
              >
                {node.content || '(empty)'}
              </div>

              <div
                style={{ display: 'flex', gap: 4, marginTop: 4 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => onFocus(node.nodeId)}
                  title="Add a child from here (type in the bar below)"
                  style={actionStyle(COLORS.branch)}
                >
                  ＋
                </button>
                {focused && (
                  <button onClick={() => onDiverge(node)} style={actionStyle(COLORS.branch)}>
                    ⌥ branch
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function actionStyle(color: string) {
  return {
    background: 'transparent',
    border: 'none',
    color,
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: FONTS.mono,
    padding: '1px 5px',
  };
}
