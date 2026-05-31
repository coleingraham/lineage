import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { BranchIntent, Node } from '@lineage/core';
import type { Authoring } from '../hooks/useAuthoring.js';
import type { FoldMode, HingeInfo } from '../fold/types.js';
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
  /** Current fold posture — selects the linear stack vs. the book spread. */
  mode: FoldMode;
  /** Reading-column / spread width. The compose bar ignores this and spans the
   * full pane. */
  maxWidth: number;
  /** Real hinge geometry, when the posture source provides it (native plugin). */
  hinge?: HingeInfo;
}

function PageLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontFamily: FONTS.mono,
        color: COLORS.textSecondary,
        margin: '0 0 8px 6px',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The capture-read view. Two layouts over the same data, selected by posture:
 * - **linear** (`closed`/`flat`): the active line as a single card stack with
 *   the focused node's divergences listed below (C1).
 * - **book** spread (`book`): left page = the spine (root → focused), right
 *   page = the focused node's divergences. The hinge sits at the fork point;
 *   reaching across it (tapping a divergence) walks into that branch (C2).
 *
 * Authoring (append / diverge-with-intent) and the compose footer are shared
 * across both layouts.
 */
export function CoverView({
  treeId,
  nodes,
  focusedNodeId,
  onFocus,
  authoring,
  mode,
  maxWidth,
  hinge,
}: CoverViewProps) {
  const nodeMap = useMemo(() => buildNodeMap(nodes), [nodes]);
  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes]);
  const rootId = useMemo(() => nodes.find((n) => n.parentId === null)?.nodeId ?? null, [nodes]);

  const focusId = nodeMap.has(focusedNodeId) ? focusedNodeId : (rootId ?? focusedNodeId);
  const line = useMemo(() => pathToRoot(nodeMap, focusId), [nodeMap, focusId]);
  const divergences = useMemo(() => childrenOf(childrenMap, focusId), [childrenMap, focusId]);

  // Diverge flow: pick an intent, then compose the divergence content.
  const [picking, setPicking] = useState(false);
  const [divergeIntent, setDivergeIntent] = useState<BranchIntent | null>(null);

  // Edit state lives here (not in MonologueCard) so it survives the
  // linear↔book layout swap rather than being lost to a remount.
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const resetDiverge = () => {
    setPicking(false);
    setDivergeIntent(null);
  };

  // Focusing anything else cancels an in-progress edit/diverge.
  const focusNode = (id: string) => {
    setEditingNodeId(null);
    resetDiverge();
    onFocus(id);
  };

  const saveEdit = async () => {
    if (!editingNodeId) return;
    const id = await authoring.edit(editingNodeId, draft);
    setEditingNodeId(null);
    onFocus(id);
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

  // One spine card, fully wired — reused by both layouts.
  const spineCard = (node: Node) => (
    <MonologueCard
      key={node.nodeId}
      node={node}
      isRoot={node.parentId === null}
      focused={node.nodeId === focusId}
      editing={editingNodeId === node.nodeId}
      draft={draft}
      onFocus={() => focusNode(node.nodeId)}
      onStartEdit={() => {
        setEditingNodeId(node.nodeId);
        setDraft(node.content);
      }}
      onDraftChange={setDraft}
      onSaveEdit={() => void saveEdit()}
      onCancelEdit={() => setEditingNodeId(null)}
      onDelete={() => {
        void authoring.remove(node.nodeId);
        if (node.parentId) onFocus(node.parentId);
      }}
      onDiverge={() => {
        setEditingNodeId(null);
        onFocus(node.nodeId);
        setPicking(true);
        setDivergeIntent(null);
      }}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, minWidth: 0 }}>
      {mode === 'book' ? (
        <BookSpread
          line={line}
          divergences={divergences}
          maxWidth={maxWidth}
          renderSpineCard={spineCard}
          onFocus={focusNode}
          hinge={hinge}
        />
      ) : (
        <LinearStack
          line={line}
          divergences={divergences}
          maxWidth={maxWidth}
          renderSpineCard={spineCard}
          onFocus={focusNode}
        />
      )}

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

interface LayoutProps {
  line: Node[];
  divergences: Node[];
  maxWidth: number;
  renderSpineCard: (node: Node) => ReactNode;
  onFocus: (nodeId: string) => void;
  hinge?: HingeInfo;
}

/** Single-column stack (cover / flat): spine then divergence chips below. */
function LinearStack({ line, divergences, maxWidth, renderSpineCard, onFocus }: LayoutProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ maxWidth, margin: '0 auto', padding: '12px 10px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{line.map(renderSpineCard)}</div>

        {divergences.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <PageLabel>branches from here</PageLabel>
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
                  <span style={{ fontSize: 10, fontFamily: FONTS.mono, color: intentColor(child.intent) }}>
                    {child.intent ?? 'sequence'}
                  </span>
                  <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {child.content.split('\n')[0] || '(empty)'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Book posture: two portrait pages either side of the hinge. Left = the spine
 * you're on; right = what diverges from the focused (last) node. The hinge is
 * the fork point; tapping a divergence reaches across it into that branch.
 *
 * When the posture source reports real hinge geometry (the native plugin), the
 * seam is placed at the actual fold position and an occlusion gutter keeps
 * content out from under it. Otherwise (desktop / size-inferred / manual book)
 * it falls back to a centred split with a thin seam.
 */
function BookSpread({ line, divergences, maxWidth, renderSpineCard, onFocus, hinge }: LayoutProps) {
  const pageBase: CSSProperties = {
    minWidth: 0,
    overflowY: 'auto',
    padding: '14px 14px 16px',
  };

  const leftPage = (style: CSSProperties) => (
    <div style={{ ...pageBase, ...style }}>
      <PageLabel>spine</PageLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{line.map(renderSpineCard)}</div>
    </div>
  );

  const rightPage = (style: CSSProperties) => (
    <div style={{ ...pageBase, ...style }}>
      <PageLabel>{divergences.length > 0 ? 'divergences' : 'divergences — none yet'}</PageLabel>
      {divergences.length === 0 ? (
        <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.6, padding: '8px 6px' }}>
          The focused thought has no branches yet. Use{' '}
          <span style={{ color: COLORS.branch }}>⌥ diverge</span> on it to open an alternative,
          elaboration, or objection here.
        </div>
      ) : (
        divergences.map((child) => (
          <button
            key={child.nodeId}
            onClick={() => onFocus(child.nodeId)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              marginBottom: 8,
              padding: '10px 12px',
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderLeft: `3px solid ${intentColor(child.intent)}`,
              borderRadius: '0 8px 8px 0',
              color: COLORS.text,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 11, fontFamily: FONTS.mono, color: intentColor(child.intent), marginBottom: 4 }}>
              {child.intent ?? 'sequence'}
            </div>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 6,
                overflow: 'hidden',
              }}
            >
              {child.content || '(empty)'}
            </div>
          </button>
        ))
      )}
    </div>
  );

  // Real hinge geometry (native plugin): split at the fold, gutter = occlusion.
  if (hinge && hinge.orientation === 'vertical' && hinge.position > 0) {
    const size = Math.max(hinge.size ?? 0, 0);
    const leftWidth = Math.max(140, Math.round(hinge.position - size / 2));
    const gutter = Math.max(size, 1);
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', width: '100%' }}>
        {leftPage({ flex: `0 0 ${leftWidth}px`, width: leftWidth })}
        <div
          aria-hidden
          style={{
            width: gutter,
            flex: '0 0 auto',
            background: COLORS.bg,
            boxShadow: 'inset 0 0 14px rgba(0,0,0,0.6)',
          }}
        />
        {rightPage({ flex: '1 1 0' })}
      </div>
    );
  }

  // Fallback: centred, equal pages, thin seam.
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', width: '100%', maxWidth }}>
        {leftPage({ flex: 1 })}
        <div
          aria-hidden
          style={{
            width: 2,
            flex: '0 0 auto',
            background: COLORS.borderHi,
            boxShadow: '0 0 14px 2px rgba(0,0,0,0.5)',
          }}
        />
        {rightPage({ flex: 1 })}
      </div>
    </div>
  );
}
