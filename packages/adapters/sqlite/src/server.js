import { runMigrations } from './migrations/index.js';
function rowToNode(row) {
  return {
    nodeId: row.node_id,
    treeId: row.tree_id,
    parentId: row.parent_id,
    type: row.type_name,
    content: row.content,
    isDeleted: row.is_deleted === 1,
    createdAt: row.created_at,
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
    createdAt: row.created_at,
    rootNodeId: row.root_node_id,
  };
}
export class SqliteRepository {
  db;
  constructor(db) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
  }
  async getTree(treeId) {
    const row = this.db.prepare('SELECT * FROM trees WHERE tree_id = ?').get(treeId);
    if (!row) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return rowToTree(row);
  }
  async listTrees() {
    const rows = this.db.prepare('SELECT * FROM trees').all();
    return rows.map(rowToTree);
  }
  async putTree(tree) {
    this.db
      .prepare(
        `INSERT INTO trees (tree_id, title, created_at, root_node_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(tree_id) DO UPDATE SET
           title = excluded.title,
           created_at = excluded.created_at,
           root_node_id = excluded.root_node_id`,
      )
      .run(tree.treeId, tree.title, tree.createdAt, tree.rootNodeId);
  }
  async getNode(nodeId) {
    const row = this.db
      .prepare(
        `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                n.content, n.is_deleted, n.created_at, n.model_name,
                n.provider, n.token_count, n.embedding_model
         FROM nodes n
         JOIN node_types nt ON nt.id = n.node_type_id
         WHERE n.node_id = ?`,
      )
      .get(nodeId);
    if (!row) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return rowToNode(row);
  }
  async getNodes(treeId) {
    const rows = this.db
      .prepare(
        `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                n.content, n.is_deleted, n.created_at, n.model_name,
                n.provider, n.token_count, n.embedding_model
         FROM nodes n
         JOIN node_types nt ON nt.id = n.node_type_id
         WHERE n.tree_id = ?`,
      )
      .all(treeId);
    return rows.map(rowToNode);
  }
  async putNode(node) {
    this.db
      .prepare(
        `INSERT INTO nodes (node_id, tree_id, parent_id, node_type_id, content, is_deleted, created_at, model_name, provider, token_count, embedding_model)
         VALUES (?, ?, ?, (SELECT id FROM node_types WHERE name = ?), ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET
           tree_id = excluded.tree_id,
           parent_id = excluded.parent_id,
           node_type_id = excluded.node_type_id,
           content = excluded.content,
           is_deleted = excluded.is_deleted,
           created_at = excluded.created_at,
           model_name = excluded.model_name,
           provider = excluded.provider,
           token_count = excluded.token_count,
           embedding_model = excluded.embedding_model`,
      )
      .run(
        node.nodeId,
        node.treeId,
        node.parentId,
        node.type,
        node.content,
        node.isDeleted ? 1 : 0,
        node.createdAt,
        node.modelName,
        node.provider,
        node.tokenCount,
        node.embeddingModel,
      );
  }
  async softDeleteNode(nodeId) {
    const result = this.db.prepare('UPDATE nodes SET is_deleted = 1 WHERE node_id = ?').run(nodeId);
    if (result.changes === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId, embedding, model) {
    // No-op: SQLite backend does not support embeddings
  }
}
//# sourceMappingURL=server.js.map
