import type postgres from 'postgres';
import type { Node, NodeRepository, Tree } from '@lineage/core';
import { runMigrations } from './migrations/index.js';

interface NodeRow {
  node_id: string;
  tree_id: string;
  parent_id: string | null;
  type_name: string;
  content: string;
  is_deleted: boolean;
  created_at: string;
  model_name: string | null;
  provider: string | null;
  token_count: number | null;
  embedding_model: string | null;
}

interface TreeRow {
  tree_id: string;
  title: string;
  created_at: string;
  root_node_id: string;
}

function rowToNode(row: NodeRow): Node {
  return {
    nodeId: row.node_id,
    treeId: row.tree_id,
    parentId: row.parent_id,
    type: row.type_name as Node['type'],
    content: row.content,
    isDeleted: row.is_deleted,
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    modelName: row.model_name,
    provider: row.provider,
    tokenCount: row.token_count,
    embeddingModel: row.embedding_model,
  };
}

function rowToTree(row: TreeRow): Tree {
  return {
    treeId: row.tree_id,
    title: row.title,
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    rootNodeId: row.root_node_id,
  };
}

export class PostgresRepository implements NodeRepository {
  private sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  async migrate(): Promise<void> {
    await runMigrations(this.sql);
  }

  async getTree(treeId: string): Promise<Tree> {
    const rows = await this.sql<TreeRow[]>`
      SELECT tree_id, title, created_at, root_node_id
      FROM trees
      WHERE tree_id = ${treeId}
    `;
    if (rows.length === 0) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return rowToTree(rows[0]);
  }

  async listTrees(): Promise<Tree[]> {
    const rows = await this.sql<TreeRow[]>`
      SELECT tree_id, title, created_at, root_node_id
      FROM trees
    `;
    return rows.map(rowToTree);
  }

  async putTree(tree: Tree): Promise<void> {
    await this.sql`
      INSERT INTO trees (tree_id, title, created_at, root_node_id)
      VALUES (${tree.treeId}, ${tree.title}, ${tree.createdAt}, ${tree.rootNodeId})
      ON CONFLICT (tree_id) DO UPDATE SET
        title = EXCLUDED.title,
        created_at = EXCLUDED.created_at,
        root_node_id = EXCLUDED.root_node_id
    `;
  }

  async getNode(nodeId: string): Promise<Node> {
    const rows = await this.sql<NodeRow[]>`
      SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
             n.content, n.is_deleted, n.created_at, n.model_name,
             n.provider, n.token_count, n.embedding_model
      FROM nodes n
      JOIN node_types nt ON nt.id = n.node_type_id
      WHERE n.node_id = ${nodeId}
    `;
    if (rows.length === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return rowToNode(rows[0]);
  }

  async getNodes(treeId: string): Promise<Node[]> {
    const rows = await this.sql<NodeRow[]>`
      SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
             n.content, n.is_deleted, n.created_at, n.model_name,
             n.provider, n.token_count, n.embedding_model
      FROM nodes n
      JOIN node_types nt ON nt.id = n.node_type_id
      WHERE n.tree_id = ${treeId}
    `;
    return rows.map(rowToNode);
  }

  async putNode(node: Node): Promise<void> {
    await this.sql`
      INSERT INTO nodes (node_id, tree_id, parent_id, node_type_id, content, is_deleted,
                         created_at, model_name, provider, token_count, embedding_model)
      VALUES (${node.nodeId}, ${node.treeId}, ${node.parentId},
              (SELECT id FROM node_types WHERE name = ${node.type}),
              ${node.content}, ${node.isDeleted}, ${node.createdAt},
              ${node.modelName}, ${node.provider}, ${node.tokenCount},
              ${node.embeddingModel})
      ON CONFLICT (node_id) DO UPDATE SET
        tree_id = EXCLUDED.tree_id,
        parent_id = EXCLUDED.parent_id,
        node_type_id = EXCLUDED.node_type_id,
        content = EXCLUDED.content,
        is_deleted = EXCLUDED.is_deleted,
        created_at = EXCLUDED.created_at,
        model_name = EXCLUDED.model_name,
        provider = EXCLUDED.provider,
        token_count = EXCLUDED.token_count,
        embedding_model = EXCLUDED.embedding_model
    `;
  }

  async softDeleteNode(nodeId: string): Promise<void> {
    const result = await this.sql`
      UPDATE nodes SET is_deleted = TRUE WHERE node_id = ${nodeId}
    `;
    if (result.count === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
  }

  async deleteTree(treeId: string): Promise<void> {
    await this.sql`DELETE FROM nodes WHERE tree_id = ${treeId}`;
    const result = await this.sql`DELETE FROM trees WHERE tree_id = ${treeId}`;
    if (result.count === 0) {
      throw new Error(`Tree not found: ${treeId}`);
    }
  }

  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.sql`
      UPDATE nodes
      SET embedding = ${vectorStr}::vector,
          embedding_model = ${model}
      WHERE node_id = ${nodeId}
    `;
  }
}
