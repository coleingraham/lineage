import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Node } from '@lineage/core';
import { COLORS } from '../styles/theme.js';
import { GraphRenderer } from '../components/GraphRenderer.js';
import type { GraphCallbacks } from '../components/graph/GraphRendererTypes.js';
import { toGraphNodes } from '../components/graph/convertNodes.js';
import { Sidebar } from '../components/graph/Sidebar.js';
import { useStreamingStore } from '../store/streaming.js';
import { useStreamingCallbacks } from '../store/useStreamingCallbacks.js';

interface GraphViewProps {
  nodes: Node[];
  treeId: string;
  onDelete: (nodeId: string) => void;
  onEdit: (nodeId: string, content: string) => Promise<void>;
  onCompose: (parentNodeId: string, content: string) => Promise<void>;
  focusNodeId: string | null;
  onFocusHandled: () => void;
}

export function GraphView({ nodes, treeId, onDelete, onEdit, onCompose, focusNodeId, onFocusHandled }: GraphViewProps) {
  const graphNodes = useMemo(() => toGraphNodes(nodes), [nodes]);

  const rootNode = graphNodes.find((n) => n.parentId === null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(rootNode?.id ?? null);

  const streaming = useStreamingStore();
  const { onNodeReply, onNodeRegenerate, onNodeSummarize } = useStreamingCallbacks(treeId);

  const nodeById = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes]);

  // Focus newly created node after streaming completes
  useEffect(() => {
    if (focusNodeId && nodeById.has(focusNodeId)) {
      setSelectedNodeId(focusNodeId);
      onFocusHandled();
    }
  }, [focusNodeId, nodeById, onFocusHandled]);

  const handleNodeEdit = useCallback(
    (nodeId: string) => {
      const node = nodeById.get(nodeId);
      if (!node) return;
      const newContent = prompt('Edit message:', node.content);
      if (newContent !== null && newContent !== node.content) {
        onEdit(nodeId, newContent);
      }
    },
    [nodeById, onEdit],
  );

  const callbacks: GraphCallbacks = useMemo(
    () => ({
      onNodeSelect: (nodeId: string) => setSelectedNodeId(nodeId),
      onNodeEdit: handleNodeEdit,
      onNodeRegenerate: (nodeId: string) => {
        const node = nodeById.get(nodeId);
        onNodeRegenerate(nodeId, node?.parentId ?? null);
      },
      onNodeSummarize: (nodeId: string) => {
        onNodeSummarize(nodeId);
      },
      onNodeDelete: (nodeId: string) => {
        onDelete(nodeId);
      },
      onNodeReply: (nodeId: string) => {
        const node = nodeById.get(nodeId);
        if (node && node.type === 'ai') {
          const content = prompt('Your reply:');
          if (content) onCompose(nodeId, content);
        } else {
          onNodeReply(nodeId);
        }
      },
    }),
    [nodeById, onNodeReply, onNodeRegenerate, onNodeSummarize, onDelete, handleNodeEdit, onCompose],
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
