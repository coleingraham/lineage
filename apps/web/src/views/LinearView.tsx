import { useState, useMemo, useCallback } from 'react';
import type { Node } from '@lineage/core';
import { COLORS, FONTS, nodeColor } from '../styles/theme.js';
import type { GraphCallbacks, GraphNode } from '../components/graph/GraphRendererTypes.js';
import { toGraphNodes } from '../components/graph/convertNodes.js';
import { RoleIcon, ActionBtn } from '../components/graph/NodeCardShared.js';
import {
  buildChildrenMap,
  findDeepestFirstChild,
  buildPathEntries,
} from '../components/graph/linearUtils.js';

// ── Mock data (shared with GraphView for development) ───────────────────────

const MOCK_NODES: Node[] = [
  {
    nodeId: 'root',
    treeId: 't1',
    parentId: null,
    type: 'human',
    content:
      'The recursive descent parser has grown to ~2,400 lines. Maintenance velocity has dropped — new grammar rules take 3–5x longer than six months ago. I\'m wondering if we should consider a rewrite.',
    isDeleted: false,
    createdAt: '2026-04-01T10:00:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
  },
  {
    nodeId: 'a1',
    treeId: 't1',
    parentId: 'root',
    type: 'ai',
    content:
      "That's a significant maintenance burden. Before committing to a rewrite, it's worth separating two distinct problems: the parser is hard to extend because the grammar is implicit (no formal spec), and the parser is hard to read because the rule boundaries aren't well-defined.\n\nA PEG-based approach addresses both — you get a formal grammar spec and generated parser code. The tradeoff is that PEG parsers require care around error recovery. What's your team's experience with parser generators?",
    isDeleted: false,
    createdAt: '2026-04-01T10:01:00Z',
    modelName: 'claude-opus-4-6',
    provider: 'anthropic',
    tokenCount: 120,
    embeddingModel: null,
  },
  {
    nodeId: 'h2',
    treeId: 't1',
    parentId: 'a1',
    type: 'human',
    content:
      "We have one person who's worked with ANTLR before. The rest of the team hasn't used a parser generator. Error recovery is important to us — we surface parser errors directly to end users.",
    isDeleted: false,
    createdAt: '2026-04-01T10:05:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
  },
  {
    nodeId: 'a2',
    treeId: 't1',
    parentId: 'h2',
    type: 'ai',
    content:
      "Given that error recovery is user-facing, I'd lean toward an incremental refactor rather than a full PEG rewrite. The risk with PEG is that error message quality regresses during the transition, and fixing that is non-trivial work on top of the rewrite itself.\n\nA middle path worth considering: write the grammar spec in BNF/PEG notation as documentation first, without changing the runtime parser.",
    isDeleted: false,
    createdAt: '2026-04-01T10:06:00Z',
    modelName: 'claude-opus-4-6',
    provider: 'anthropic',
    tokenCount: 95,
    embeddingModel: null,
  },
  {
    nodeId: 'h3-branch',
    treeId: 't1',
    parentId: 'a1',
    type: 'human',
    content:
      "What if we took the PEG approach but only for the expression subset? That's where 80% of the complexity lives.",
    isDeleted: false,
    createdAt: '2026-04-01T10:10:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
  },
  {
    nodeId: 'a3-branch',
    treeId: 't1',
    parentId: 'h3-branch',
    type: 'ai',
    content:
      "That's a pragmatic hybrid approach. Rewriting just the expression parser in PEG would give you the biggest bang for the buck — expressions are where recursive descent gets most tangled. The statement-level parser could stay hand-written since it's more linear.\n\nThe key risk is the boundary between the two parsers. You'd need a clean handoff protocol.",
    isDeleted: false,
    createdAt: '2026-04-01T10:11:00Z',
    modelName: 'claude-opus-4-6',
    provider: 'anthropic',
    tokenCount: 88,
    embeddingModel: null,
  },
  {
    nodeId: 'deleted-node',
    treeId: 't1',
    parentId: 'a2',
    type: 'human',
    content: 'This was a dead-end tangent about rewriting in Rust.',
    isDeleted: true,
    createdAt: '2026-04-01T10:08:00Z',
    modelName: null,
    provider: null,
    tokenCount: null,
    embeddingModel: null,
  },
  {
    nodeId: 'summary-1',
    treeId: 't1',
    parentId: 'a2',
    type: 'summary',
    content:
      'The team is considering whether to rewrite a 2,400-line recursive descent parser. Key constraint: error recovery is user-facing, making a full PEG rewrite risky. Converged on a hybrid approach — extract grammar rules into named functions for readability, write BNF spec as documentation in parallel.',
    isDeleted: false,
    createdAt: '2026-04-01T10:12:00Z',
    modelName: 'claude-opus-4-6',
    provider: 'anthropic',
    tokenCount: 65,
    embeddingModel: null,
  },
];

// ── Sibling navigator ───────────────────────────────────────────────────────

function SiblingNav({
  siblings,
  currentId,
  onSelect,
}: {
  siblings: GraphNode[];
  currentId: string;
  onSelect: (nodeId: string) => void;
}) {
  if (siblings.length <= 1) return null;

  const idx = siblings.findIndex((s) => s.id === currentId);
  const current = idx + 1;
  const total = siblings.length;
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx < siblings.length - 1 ? siblings[idx + 1] : null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: FONTS.mono,
        fontSize: '10px',
        color: COLORS.textSecondary,
      }}
    >
      <button
        onClick={() => prev && onSelect(prev.id)}
        disabled={!prev}
        style={{
          background: 'none',
          border: 'none',
          color: prev ? COLORS.text : COLORS.muted,
          cursor: prev ? 'pointer' : 'default',
          fontSize: '12px',
          padding: '0 4px',
          opacity: prev ? 0.7 : 0.25,
        }}
      >
        ‹
      </button>
      <span style={{ letterSpacing: '0.06em' }}>
        {current} / {total}
      </span>
      <button
        onClick={() => next && onSelect(next.id)}
        disabled={!next}
        style={{
          background: 'none',
          border: 'none',
          color: next ? COLORS.text : COLORS.muted,
          cursor: next ? 'pointer' : 'default',
          fontSize: '12px',
          padding: '0 4px',
          opacity: next ? 0.7 : 0.25,
        }}
      >
        ›
      </button>
    </div>
  );
}

// ── Linear node card ────────────────────────────────────────────────────────

function LinearNodeCard({
  node,
  siblings,
  isSelected,
  isLeaf,
  callbacks,
  onSiblingSelect,
}: {
  node: GraphNode;
  siblings: GraphNode[];
  isSelected: boolean;
  isLeaf: boolean;
  callbacks: GraphCallbacks;
  onSiblingSelect: (nodeId: string) => void;
}) {
  const c = nodeColor(node.type, node.isDeleted);
  const [hover, setHover] = useState(false);

  // ── Deleted ───────────────────────────────────────────────────────────────
  if (node.isDeleted) {
    return (
      <div
        onClick={() => callbacks.onNodeSelect(node.id)}
        style={{
          background: 'rgba(255,255,255,0.015)',
          border: `1px solid ${COLORS.border}`,
          borderLeft: `3px solid ${COLORS.muted}44`,
          borderRadius: '8px',
          padding: '18px 22px',
          opacity: 0.35,
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span
            style={{
              fontSize: '9px',
              color: COLORS.muted,
              letterSpacing: '0.08em',
              background: COLORS.muted + '18',
              padding: '2px 8px',
              borderRadius: '3px',
              fontFamily: FONTS.mono,
            }}
          >
            DELETED
          </span>
          <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
            depth {node.depth}
          </span>
          <div style={{ flex: 1 }} />
          <SiblingNav siblings={siblings} currentId={node.id} onSelect={onSiblingSelect} />
        </div>
        <p
          style={{
            fontFamily: FONTS.mono,
            fontSize: '13px',
            color: '#383838',
            lineHeight: 1.75,
            margin: 0,
            textDecoration: 'line-through',
          }}
        >
          {node.content || '(empty)'}
        </p>
      </div>
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (node.type === 'summary') {
    return (
      <div
        onClick={() => callbacks.onNodeSelect(node.id)}
        style={{
          background: 'rgba(184,160,216,0.06)',
          border: `1px solid ${COLORS.summary}33`,
          borderLeft: `3px solid ${COLORS.summary}`,
          borderRadius: '8px',
          padding: '18px 22px',
          cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '2px',
              background: COLORS.summary,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '10px',
              color: COLORS.summary + 'cc',
              fontFamily: FONTS.mono,
              letterSpacing: '0.08em',
            }}
          >
            SUMMARY · IMMUTABLE
          </span>
          <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
            depth {node.depth}
          </span>
          <div style={{ flex: 1 }} />
          <SiblingNav siblings={siblings} currentId={node.id} onSelect={onSiblingSelect} />
        </div>
        <p
          style={{
            fontFamily: FONTS.mono,
            fontSize: '13px',
            color: COLORS.textSecondary,
            lineHeight: 1.75,
            margin: 0,
          }}
        >
          {node.content || '(empty)'}
        </p>
      </div>
    );
  }

  // ── Normal ────────────────────────────────────────────────────────────────
  return (
    <div
      onClick={() => callbacks.onNodeSelect(node.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: isSelected ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isSelected ? 'rgba(255,255,255,0.12)' : COLORS.border}`,
        borderLeft: `3px solid ${c}`,
        borderRadius: '8px',
        padding: '18px 22px',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <RoleIcon role={node.type} size={16} />
        <span
          style={{
            fontSize: '9px',
            color: c,
            letterSpacing: '0.08em',
            background: c + '18',
            padding: '2px 8px',
            borderRadius: '3px',
            fontFamily: FONTS.mono,
          }}
        >
          {node.type.toUpperCase()}
        </span>
        <span style={{ fontSize: '9px', color: '#2e2e2e', fontFamily: FONTS.mono }}>
          depth {node.depth}
        </span>
        <div style={{ flex: 1 }} />
        <SiblingNav siblings={siblings} currentId={node.id} onSelect={onSiblingSelect} />
        {(hover || isSelected) && (
          <div style={{ display: 'flex', gap: '5px', marginLeft: '8px' }}>
            {node.type === 'human' && (
              <ActionBtn
                label="Edit"
                color={COLORS.human}
                onClick={() => callbacks.onNodeEdit(node.id)}
              />
            )}
            {node.type === 'ai' && (
              <ActionBtn
                label="↺ Regen"
                color={COLORS.ai}
                onClick={() => callbacks.onNodeRegenerate(node.id)}
              />
            )}
            <ActionBtn
              label={node.type === 'human' ? 'Generate reply ↓' : 'Add reply ↓'}
              color={c}
              onClick={() => callbacks.onNodeReply(node.id)}
              primary
            />
            {isLeaf && (
              <ActionBtn
                label="Summarize"
                color={COLORS.summary}
                onClick={() => callbacks.onNodeSummarize(node.id)}
              />
            )}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: FONTS.serif,
          fontWeight: 400,
          fontSize: node.type === 'ai' ? '15px' : '16px',
          color: '#ececec',
          lineHeight: 1.65,
          margin: 0,
          whiteSpace: 'pre-wrap',
        }}
      >
        {node.content || '(empty)'}
      </div>
      {node.metadata.modelName && (
        <div
          style={{
            marginTop: '10px',
            fontSize: '10px',
            color: '#2a2a2a',
            fontFamily: FONTS.mono,
          }}
        >
          {node.metadata.provider}/{node.metadata.modelName}
          {node.metadata.tokenCount != null && ` · ${node.metadata.tokenCount} tokens`}
        </div>
      )}
    </div>
  );
}

// ── Vertical connector between cards ────────────────────────────────────────

function VerticalConnector() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
      <div
        style={{
          width: '1px',
          height: '16px',
          background: 'rgba(255,255,255,0.06)',
        }}
      />
    </div>
  );
}

// ── LinearView ──────────────────────────────────────────────────────────────

export function LinearView({ nodes: externalNodes }: { nodes?: Node[] }) {
  const coreNodes = externalNodes ?? MOCK_NODES;
  const graphNodes = useMemo(() => toGraphNodes(coreNodes), [coreNodes]);

  const childrenOf = useMemo(() => buildChildrenMap(graphNodes), [graphNodes]);

  const nodeById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);

  // Find deepest leaf on the default path (first child at each level)
  const defaultLeaf = useMemo(() => {
    const root = graphNodes.find((n) => n.parentId === null);
    if (!root) return null;
    return findDeepestFirstChild(root.id, nodeById, childrenOf);
  }, [graphNodes, nodeById, childrenOf]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(defaultLeaf);

  // When a sibling is selected, navigate to the deepest first-child leaf from that sibling
  const handleSiblingSelect = useCallback(
    (siblingId: string) => {
      setSelectedNodeId(findDeepestFirstChild(siblingId, nodeById, childrenOf));
    },
    [nodeById, childrenOf],
  );

  const callbacks: GraphCallbacks = useMemo(
    () => ({
      onNodeSelect: (nodeId: string) => setSelectedNodeId(nodeId),
      onNodeEdit: (nodeId: string) => {
        console.log('[stub] onNodeEdit', nodeId);
      },
      onNodeRegenerate: (nodeId: string) => {
        console.log('[stub] onNodeRegenerate', nodeId);
      },
      onNodeSummarize: (nodeId: string) => {
        console.log('[stub] onNodeSummarize', nodeId);
      },
      onNodeDelete: (nodeId: string) => {
        console.log('[stub] onNodeDelete', nodeId);
      },
      onNodeReply: (nodeId: string) => {
        console.log('[stub] onNodeReply', nodeId);
      },
    }),
    [],
  );

  const pathEntries = useMemo(
    () =>
      selectedNodeId
        ? buildPathEntries(selectedNodeId, graphNodes, nodeById, childrenOf)
        : [],
    [selectedNodeId, graphNodes, nodeById, childrenOf],
  );

  const lastNodeId = pathEntries.length > 0 ? pathEntries[pathEntries.length - 1].node.id : null;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        padding: '40px 20px',
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: '720px' }}>
        {pathEntries.map(({ node, siblings }, i) => (
          <div key={node.id}>
            {i > 0 && <VerticalConnector />}
            <LinearNodeCard
              node={node}
              siblings={siblings}
              isSelected={node.id === selectedNodeId}
              isLeaf={node.id === lastNodeId && (childrenOf.get(node.id)?.length ?? 0) === 0}
              callbacks={callbacks}
              onSiblingSelect={handleSiblingSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
