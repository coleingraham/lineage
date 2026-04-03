import { useState, useMemo } from 'react';
import type { Node } from '@lineage/core';
import { COLORS } from '../styles/theme.js';
import { GraphRenderer } from '../components/GraphRenderer.js';
import type { GraphCallbacks } from '../components/graph/GraphRendererTypes.js';
import { toGraphNodes } from '../components/graph/convertNodes.js';
import { Sidebar } from '../components/graph/Sidebar.js';
import { useStreamingStore } from '../store/streaming.js';
import { useStreamingCallbacks } from '../store/useStreamingCallbacks.js';

// ── Mock data for development ────────────────────────────────────────────────

const MOCK_NODES: Node[] = [
  {
    nodeId: 'root',
    treeId: 't1',
    parentId: null,
    type: 'human',
    content:
      "The recursive descent parser has grown to ~2,400 lines. Maintenance velocity has dropped — new grammar rules take 3–5x longer than six months ago. I'm wondering if we should consider a rewrite.",
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

// ── GraphView ────────────────────────────────────────────────────────────────

export function GraphView({ nodes: externalNodes }: { nodes?: Node[] }) {
  const coreNodes = externalNodes ?? MOCK_NODES;
  const treeId = coreNodes[0]?.treeId ?? '';
  const graphNodes = useMemo(() => toGraphNodes(coreNodes), [coreNodes]);

  const rootNode = graphNodes.find((n) => n.parentId === null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(rootNode?.id ?? null);

  const streaming = useStreamingStore();
  const { onNodeReply, onNodeRegenerate } = useStreamingCallbacks(treeId);

  const nodeById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);

  const callbacks: GraphCallbacks = useMemo(
    () => ({
      onNodeSelect: (nodeId: string) => setSelectedNodeId(nodeId),
      onNodeEdit: (nodeId: string) => {
        console.log('[stub] onNodeEdit', nodeId);
      },
      onNodeRegenerate: (nodeId: string) => {
        const node = nodeById.get(nodeId);
        onNodeRegenerate(nodeId, node?.parentId ?? null);
      },
      onNodeSummarize: (nodeId: string) => {
        console.log('[stub] onNodeSummarize', nodeId);
      },
      onNodeDelete: (nodeId: string) => {
        console.log('[stub] onNodeDelete', nodeId);
      },
      onNodeReply: (nodeId: string) => {
        onNodeReply(nodeId);
      },
    }),
    [nodeById, onNodeReply, onNodeRegenerate],
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.bg,
        display: 'flex',
        color: COLORS.text,
      }}
    >
      <Sidebar
        nodes={graphNodes}
        selectedNodeId={selectedNodeId}
        onSelect={callbacks.onNodeSelect}
      />
      <GraphRenderer
        nodes={graphNodes}
        selectedNodeId={selectedNodeId}
        callbacks={callbacks}
        streaming={streaming}
      />
    </div>
  );
}
