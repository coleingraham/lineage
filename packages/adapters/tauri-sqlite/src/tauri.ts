import type { Node, NodeRepository, Tree } from '@lineage/core';
import Database from '@tauri-apps/plugin-sql';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS node_types (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO node_types (id, name) VALUES
  (1, 'human'), (2, 'ai'), (3, 'summary'),
  (4, 'system'), (5, 'tool_call'), (6, 'tool_result');

CREATE TABLE IF NOT EXISTS trees (
  tree_id      TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  root_node_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  node_id         TEXT PRIMARY KEY,
  tree_id         TEXT NOT NULL REFERENCES trees(tree_id),
  parent_id       TEXT,
  node_type_id    INTEGER NOT NULL REFERENCES node_types(id),
  content         TEXT NOT NULL,
  is_deleted      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  model_name      TEXT,
  provider        TEXT,
  token_count     INTEGER,
  embedding_model TEXT,
  metadata        TEXT,
  author          TEXT
);
`;

const MIGRATE_V2_STMTS = [
  "ALTER TABLE nodes ADD COLUMN metadata TEXT",
  "ALTER TABLE nodes ADD COLUMN author TEXT",
  "INSERT OR IGNORE INTO node_types (id, name) VALUES (4, 'system'), (5, 'tool_call'), (6, 'tool_result')",
];

interface NodeRow {
  node_id: string;
  tree_id: string;
  parent_id: string | null;
  type_name: string;
  content: string;
  is_deleted: number;
  created_at: string;
  model_name: string | null;
  provider: string | null;
  token_count: number | null;
  embedding_model: string | null;
  metadata: string | null;
  author: string | null;
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
    isDeleted: row.is_deleted === 1,
    createdAt: row.created_at,
    modelName: row.model_name,
    provider: row.provider,
    tokenCount: row.token_count,
    embeddingModel: row.embedding_model,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null,
    author: row.author,
  };
}

function rowToTree(row: TreeRow): Tree {
  return {
    treeId: row.tree_id,
    title: row.title,
    createdAt: row.created_at,
    rootNodeId: row.root_node_id,
  };
}

/**
 * Tauri desktop SQLite repository using @tauri-apps/plugin-sql.
 * Provides persistent local storage via Tauri's native SQLite plugin.
 *
 * Use the static `create()` factory to instantiate — it handles database
 * loading and schema migrations.
 */
export class TauriSqliteRepository implements NodeRepository {
  private db: Database;

  private constructor(db: Database) {
    this.db = db;
  }

  static async create(dbPath = 'sqlite:lineage.db'): Promise<TauriSqliteRepository> {
    const db = await Database.load(dbPath);
    await db.execute('PRAGMA foreign_keys = ON');

    // Run each DDL statement individually — tauri-plugin-sql does not support
    // multiple statements in a single execute call.
    const statements = INIT_SQL.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await db.execute(stmt);
    }

    // V2: add metadata, author columns and new node types
    const cols = await db.select<{ name: string }[]>(
      "SELECT name FROM pragma_table_info('nodes') WHERE name = 'metadata'",
    );
    if (cols.length === 0) {
      for (const stmt of MIGRATE_V2_STMTS) {
        await db.execute(stmt);
      }
    }

    return new TauriSqliteRepository(db);
  }

  async getTree(treeId: string): Promise<Tree> {
    const rows = await this.db.select<TreeRow[]>('SELECT * FROM trees WHERE tree_id = $1', [
      treeId,
    ]);
    if (rows.length === 0) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return rowToTree(rows[0]);
  }

  async listTrees(): Promise<Tree[]> {
    const rows = await this.db.select<TreeRow[]>('SELECT * FROM trees');
    return rows.map(rowToTree);
  }

  async putTree(tree: Tree): Promise<void> {
    await this.db.execute(
      `INSERT INTO trees (tree_id, title, created_at, root_node_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(tree_id) DO UPDATE SET
         title = excluded.title,
         created_at = excluded.created_at,
         root_node_id = excluded.root_node_id`,
      [tree.treeId, tree.title, tree.createdAt, tree.rootNodeId],
    );
  }

  async getNode(nodeId: string): Promise<Node> {
    const rows = await this.db.select<NodeRow[]>(
      `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
              n.content, n.is_deleted, n.created_at, n.model_name,
              n.provider, n.token_count, n.embedding_model,
              n.metadata, n.author
       FROM nodes n
       JOIN node_types nt ON nt.id = n.node_type_id
       WHERE n.node_id = $1`,
      [nodeId],
    );
    if (rows.length === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return rowToNode(rows[0]);
  }

  async getNodes(treeId: string): Promise<Node[]> {
    const rows = await this.db.select<NodeRow[]>(
      `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
              n.content, n.is_deleted, n.created_at, n.model_name,
              n.provider, n.token_count, n.embedding_model,
              n.metadata, n.author
       FROM nodes n
       JOIN node_types nt ON nt.id = n.node_type_id
       WHERE n.tree_id = $1`,
      [treeId],
    );
    return rows.map(rowToNode);
  }

  async putNode(node: Node): Promise<void> {
    await this.db.execute(
      `INSERT INTO nodes (node_id, tree_id, parent_id, node_type_id, content, is_deleted, created_at, model_name, provider, token_count, embedding_model, metadata, author)
       VALUES ($1, $2, $3, (SELECT id FROM node_types WHERE name = $4), $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
         embedding_model = excluded.embedding_model,
         metadata = excluded.metadata,
         author = excluded.author`,
      [
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
        node.metadata ? JSON.stringify(node.metadata) : null,
        node.author,
      ],
    );
  }

  async softDeleteNode(nodeId: string): Promise<void> {
    const rows = await this.db.select<{ node_id: string }[]>(
      'SELECT node_id FROM nodes WHERE node_id = $1',
      [nodeId],
    );
    if (rows.length === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    await this.db.execute('UPDATE nodes SET is_deleted = 1 WHERE node_id = $1', [nodeId]);
  }

  async deleteTree(treeId: string): Promise<void> {
    const rows = await this.db.select<{ tree_id: string }[]>(
      'SELECT tree_id FROM trees WHERE tree_id = $1',
      [treeId],
    );
    if (rows.length === 0) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    await this.db.execute('DELETE FROM nodes WHERE tree_id = $1', [treeId]);
    await this.db.execute('DELETE FROM trees WHERE tree_id = $1', [treeId]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: Tauri desktop SQLite backend does not support embeddings
  }
}
