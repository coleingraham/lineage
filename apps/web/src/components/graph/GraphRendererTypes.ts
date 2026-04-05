import type { NodeType } from '@lineage/core';
import type { StreamingStore } from '../../store/streaming.js';

export interface GraphNode {
  id: string;
  type: NodeType;
  content: string;
  parentId: string | null;
  depth: number;
  isDeleted: boolean;
  childCount: number;
  metadata: {
    modelName: string | null;
    provider: string | null;
    tokenCount: number | null;
    createdAt: string;
  };
}

export interface GraphCallbacks {
  onNodeSelect: (nodeId: string) => void;
  onNodeEdit: (nodeId: string) => void;
  onNodeRegenerate: (nodeId: string) => void;
  onNodeSummarize: (nodeId: string) => void;
  onNodeDelete: (nodeId: string) => void;
  onNodeReply: (nodeId: string) => void;
}

export interface GraphRendererProps {
  nodes: GraphNode[];
  selectedNodeId: string | null;
  callbacks: GraphCallbacks;
  streaming?: StreamingStore;
  editingNodeId?: string | null;
  editText?: string;
  onEditChange?: (text: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
}
