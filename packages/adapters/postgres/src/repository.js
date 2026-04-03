import { runMigrations } from './migrations/index.js';
function rowToNode(row) {
  return {
    nodeId: row.node_id,
    treeId: row.tree_id,
    parentId: row.parent_id,
    type: row.type_name,
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
function rowToTree(row) {
  return {
    treeId: row.tree_id,
    title: row.title,
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    rootNodeId: row.root_node_id,
  };
}
export class PostgresRepository {
  sql;
  constructor(sql) {
    this.sql = sql;
  }
  async migrate() {
    await runMigrations(this.sql);
  }
  async getTree(treeId) {
    const rows = await this.sql`
      SELECT tree_id, title, created_at, root_node_id
      FROM trees
      WHERE tree_id = ${treeId}
    `;
    if (rows.length === 0) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return rowToTree(rows[0]);
  }
  async listTrees() {
    const rows = await this.sql`
      SELECT tree_id, title, created_at, root_node_id
      FROM trees
    `;
    return rows.map(rowToTree);
  }
  async putTree(tree) {
    await this.sql`
      INSERT INTO trees (tree_id, title, created_at, root_node_id)
      VALUES (${tree.treeId}, ${tree.title}, ${tree.createdAt}, ${tree.rootNodeId})
      ON CONFLICT (tree_id) DO UPDATE SET
        title = EXCLUDED.title,
        created_at = EXCLUDED.created_at,
        root_node_id = EXCLUDED.root_node_id
    `;
  }
  async getNode(nodeId) {
    const rows = await this.sql`
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
  async getNodes(treeId) {
    const rows = await this.sql`
      SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
             n.content, n.is_deleted, n.created_at, n.model_name,
             n.provider, n.token_count, n.embedding_model
      FROM nodes n
      JOIN node_types nt ON nt.id = n.node_type_id
      WHERE n.tree_id = ${treeId}
    `;
    return rows.map(rowToNode);
  }
  async putNode(node) {
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
  async softDeleteNode(nodeId) {
    const result = await this.sql`
      UPDATE nodes SET is_deleted = TRUE WHERE node_id = ${nodeId}
    `;
    if (result.count === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
  }
  async updateNodeEmbedding(nodeId, embedding, model) {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.sql`
      UPDATE nodes
      SET embedding = ${vectorStr}::vector,
          embedding_model = ${model}
      WHERE node_id = ${nodeId}
    `;
  }
}
//# sourceMappingURL=repository.js.map
