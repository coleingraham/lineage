export type NodeType = 'human' | 'ai' | 'summary';

export interface Node {
  nodeId: string;
  treeId: string;
  parentId: string | null;
  type: NodeType;
  content: string;
  isDeleted: boolean;
  createdAt: string;
  modelName: string | null;
  provider: string | null;
  tokenCount: number | null;
  embeddingModel: string | null;
}

export interface Tree {
  treeId: string;
  title: string;
  createdAt: string;
  rootNodeId: string;
}
