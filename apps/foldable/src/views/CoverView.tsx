import { useMemo, useState } from 'react';
import type { BranchIntent, Node } from '@lineage/core';
import type { Authoring } from '../hooks/useAuthoring.js';
import { buildChildrenMap, buildNodeMap, childrenOf, pathToRoot } from '../lib/tree.js';
import { COLORS, FONTS, intentColor } from '../styles/theme.js';
import { MonologueCard } from '../components/MonologueCard.js';
import { ComposeBar } from '../components/ComposeBar.js';
import { IntentPicker } from '../components/IntentPicker.js';

interface CoverViewProps {
  treeId: string;
  nodes: Node[];
  focusedNodeId: string;
  onFocus: (nodeId: string) => void;
  authoring: Authoring;
}

/**
 * Cover / linear capture-read view (C1): the active line (root → focused leaf)
 * as a vertical card stack, with the focused node's divergences below and a
 * thumb-reachable compose bar. Works on any phone; the foldable payoff (book
 * spread, flat graph) builds on this same data later.
 */
export function CoverView({ treeId, nodes, focusedNodeId, onFocus, authoring }: CoverViewProps) {
  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);
  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const rootId = useMemo(() => nodes.find((n) => n.parentId === null)?.nodeId ?? null, [nodes]);

  const focusId = nodeMap.has(focusedNodeId) ? focusedNodeId : (rootId ?? focusedNodeId);
  const line = useMemo(() => pathToRoot(nodeMap, focusId), [nodeMap, focusId]);
  const divergences = useMemo(() => childrenOf(childrenMap, focusId), [childrenMap, focusId]);

  // Diverge flow: pick an intent, then compose the divergence content.
  const [picking, setPicking] = useState(false);
  const [divergeIntent, setDivergeIntent] = useState<BranchIntent | null>(null);

  const resetDiverge = () => {
    setPicking(false);
    setDivergeIntent(null);
  };

  const submitAppend = async (content: string) => {
    const id = await authoring.append(treeId, focusId, content);
    onFocus(id);
  };

  const submitDiverge = async (content: string) => {
    if (!divergeIntent) return;
    const id = await authoring.diverge(treeId, focusId, content, divergeIntent);
    resetDiverge();
    onFocus(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {line.map((node) => (
            <MonologueCard
              key={node.nodeId}
              node={node}
              isRoot={node.parentId === null}
              focused={node.nodeId === focusId}
              onFocus={() => onFocus(node.nodeId)}
              onEdit={(content) => void authoring.edit(node.nodeId, content)}
              onDelete={() => {
                void authoring.remove(node.nodeId);
                if (node.parentId) onFocus(node.parentId);
              }}
              onDiverge={() => {
                onFocus(node.nodeId);
                setPicking(true);
                setDivergeIntent(null);
              }}
            />
          ))}
        </div>

        {divergences.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 11,
                fontFamily: FONTS.mono,
                color: COLORS.textSecondary,
                margin: '0 0 6px 6px',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              branches from here
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {divergences.map((child) => (
                <button
                  key={child.nodeId}
                  onClick={() => onFocus(child.nodeId)}
                  style={{
                    maxWidth: 240,
                    textAlign: 'left',
                    padding: '6px 10px',
                    background: COLORS.surface,
                    border: `1px solid ${intentColor(child.intent)}`,
                    borderRadius: 8,
                    color: COLORS.text,
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: FONTS.mono,
                      color: intentColor(child.intent),
                    }}
                  >
                    {child.intent ?? 'sequence'}
                  </span>
                  <div
                    style={{
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {child.content.split('\n')[0] || '(empty)'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {picking && !divergeIntent ? (
        <IntentPicker onPick={(intent) => setDivergeIntent(intent)} onCancel={resetDiverge} />
      ) : divergeIntent ? (
        <ComposeBar
          key="diverge"
          autoFocus
          accent={intentColor(divergeIntent)}
          submitLabel="Branch"
          placeholder={`Write the ${divergeIntent}…`}
          onSubmit={submitDiverge}
        />
      ) : (
        <ComposeBar key="append" placeholder="Continue the line…" onSubmit={submitAppend} />
      )}
    </div>
  );
}
