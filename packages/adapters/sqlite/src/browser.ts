import type { Node, NodeRepository, Tree } from '@lineage/core';
import { SQLITE_ROW, type SQLiteAPI } from 'wa-sqlite';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS node_types (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO node_types (id, name) VALUES (1, 'human'), (2, 'ai'), (3, 'summary');

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
  embedding_model TEXT
);
`;

interface NodeRow {
  [key: string]: unknown;
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
}

interface TreeRow {
  [key: string]: unknown;
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
 * Browser-side SQLite repository using wa-sqlite + OPFS.
 * Provides persistent local storage directly in the browser without a server.
 *
 * Use the static `create()` factory to instantiate — it handles async WASM
 * initialisation, OPFS VFS registration, and schema migrations.
 */
export class BrowserSqliteRepository implements NodeRepository {
  private sqlite3: SQLiteAPI;
  private db: number;

  private constructor(sqlite3: SQLiteAPI, db: number) {
    this.sqlite3 = sqlite3;
    this.db = db;
  }

  static async create(dbName = 'lineage'): Promise<BrowserSqliteRepository> {
    const [{ Factory }, { default: SQLiteESMFactory }, { OPFSAnyContextVFS }] = await Promise.all([
      import('wa-sqlite'),
      import('wa-sqlite/dist/wa-sqlite-async.mjs'),
      import('wa-sqlite/src/vfs/OPFSAnyContextVFS.js'),
    ]);

    const wasmModule = await SQLiteESMFactory();
    const sqlite3 = Factory(wasmModule);

    const vfs = await OPFSAnyContextVFS.create(dbName, wasmModule);
    sqlite3.vfs_register(vfs, true);

    const db = await sqlite3.open_v2(`${dbName}.db`);
    await sqlite3.exec(db, 'PRAGMA foreign_keys = ON');
    await sqlite3.exec(db, INIT_SQL);

    return new BrowserSqliteRepository(sqlite3, db);
  }

  /** Execute a write statement with optional bound parameters. */
  private async run(sql: string, params: unknown[] = []): Promise<void> {
    for await (const stmt of this.sqlite3.statements(this.db, sql)) {
      if (params.length > 0) {
        this.sqlite3.bind(stmt, params);
      }
      await this.sqlite3.step(stmt);
    }
  }

  /** Execute a SELECT and return all matching rows. */
  private async all<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const rows: T[] = [];
    for await (const stmt of this.sqlite3.statements(this.db, sql)) {
      if (params.length > 0) {
        this.sqlite3.bind(stmt, params);
      }
      const columns = this.sqlite3.column_names(stmt);
      while ((await this.sqlite3.step(stmt)) === SQLITE_ROW) {
        const values = this.sqlite3.row(stmt);
        rows.push(Object.fromEntries(columns.map((c, i) => [c, values[i]])) as T);
      }
    }
    return rows;
  }

  /** Execute a SELECT and return the first row, or undefined. */
  private async get<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async getTree(treeId: string): Promise<Tree> {
    const row = await this.get<TreeRow>('SELECT * FROM trees WHERE tree_id = ?', [treeId]);
    if (!row) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return rowToTree(row);
  }

  async listTrees(): Promise<Tree[]> {
    const rows = await this.all<TreeRow>('SELECT * FROM trees');
    return rows.map(rowToTree);
  }

  async putTree(tree: Tree): Promise<void> {
    await this.run(
      `INSERT INTO trees (tree_id, title, created_at, root_node_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(tree_id) DO UPDATE SET
         title = excluded.title,
         created_at = excluded.created_at,
         root_node_id = excluded.root_node_id`,
      [tree.treeId, tree.title, tree.createdAt, tree.rootNodeId],
    );
  }

  async getNode(nodeId: string): Promise<Node> {
    const row = await this.get<NodeRow>(
      `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
              n.content, n.is_deleted, n.created_at, n.model_name,
              n.provider, n.token_count, n.embedding_model
       FROM nodes n
       JOIN node_types nt ON nt.id = n.node_type_id
       WHERE n.node_id = ?`,
      [nodeId],
    );
    if (!row) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return rowToNode(row);
  }

  async getNodes(treeId: string): Promise<Node[]> {
    const rows = await this.all<NodeRow>(
      `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
              n.content, n.is_deleted, n.created_at, n.model_name,
              n.provider, n.token_count, n.embedding_model
       FROM nodes n
       JOIN node_types nt ON nt.id = n.node_type_id
       WHERE n.tree_id = ?`,
      [treeId],
    );
    return rows.map(rowToNode);
  }

  async putNode(node: Node): Promise<void> {
    await this.run(
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
      ],
    );
  }

  async softDeleteNode(nodeId: string): Promise<void> {
    const before = await this.get<{ node_id: string }>(
      'SELECT node_id FROM nodes WHERE node_id = ?',
      [nodeId],
    );
    if (!before) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    await this.run('UPDATE nodes SET is_deleted = 1 WHERE node_id = ?', [nodeId]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: browser SQLite backend does not support embeddings
  }
}
