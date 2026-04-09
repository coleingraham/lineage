import type { Node, NodeRepository, Tree, SearchOptions, SearchResult } from '@lineage/core';
import initSqlJs, { type Database } from 'sql.js';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS node_types (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO node_types (id, name) VALUES
  (1, 'human'), (2, 'ai'), (3, 'summary'),
  (4, 'system'), (5, 'tool_call'), (6, 'tool_result');

CREATE TABLE IF NOT EXISTS trees (
  tree_id          TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  root_node_id     TEXT NOT NULL,
  context_sources  TEXT
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

const MIGRATE_V2 = `
ALTER TABLE nodes ADD COLUMN metadata TEXT;
ALTER TABLE nodes ADD COLUMN author TEXT;
INSERT OR IGNORE INTO node_types (id, name) VALUES
  (4, 'system'), (5, 'tool_call'), (6, 'tool_result');
`;

const MIGRATE_V3 = `
ALTER TABLE trees ADD COLUMN context_sources TEXT;
`;

const IDB_STORE = 'lineage-sqlite';

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
  context_sources: string | null;
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
    contextSources: row.context_sources
      ? (JSON.parse(row.context_sources) as Tree['contextSources'])
      : null,
  };
}

/** Load a previously-persisted database from IndexedDB, if any. */
async function loadFromIDB(storeName: string): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(storeName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('db');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('db', 'readonly');
      const get = tx.objectStore('db').get('data');
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => reject(get.error);
    };
  });
}

/** Persist the database to IndexedDB. */
async function saveToIDB(storeName: string, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(storeName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('db');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction('db', 'readwrite');
      tx.objectStore('db').put(data, 'data');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

/**
 * Browser-side SQLite repository using sql.js (Emscripten SQLite).
 * Data is persisted to IndexedDB after each write operation.
 *
 * Use the static `create()` factory to instantiate — it handles WASM loading,
 * IndexedDB restore, and schema migrations.
 */
export class BrowserSqliteRepository implements NodeRepository {
  private db: Database;
  private storeName: string;

  private constructor(db: Database, storeName: string) {
    this.db = db;
    this.storeName = storeName;
  }

  static async create(dbName = 'lineage'): Promise<BrowserSqliteRepository> {
    const SQL = await initSqlJs(
      typeof window !== 'undefined' ? { locateFile: () => `/sql-wasm.wasm` } : undefined,
    );

    const storeName = `${IDB_STORE}-${dbName}`;
    const saved = typeof indexedDB !== 'undefined' ? await loadFromIDB(storeName) : null;
    const db = saved ? new SQL.Database(saved) : new SQL.Database();

    db.run('PRAGMA foreign_keys = ON');
    db.run(INIT_SQL);

    // V2: add metadata, author columns and new node types (safe on existing DBs).
    // For freshly-created DBs the columns already exist via INIT_SQL; this
    // migration only runs when upgrading an existing database.
    const checkStmt = db.prepare(
      "SELECT COUNT(*) AS cnt FROM pragma_table_info('nodes') WHERE name = 'metadata'",
    );
    const hasRow = checkStmt.step();
    const cnt = hasRow ? (checkStmt.getAsObject() as { cnt: number }).cnt : 0;
    checkStmt.free();
    if (cnt === 0) {
      for (const stmt of MIGRATE_V2.split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        db.run(stmt);
      }
    }

    // V3: add context_sources column to trees
    const checkV3 = db.prepare(
      "SELECT COUNT(*) AS cnt FROM pragma_table_info('trees') WHERE name = 'context_sources'",
    );
    const hasV3Row = checkV3.step();
    const v3cnt = hasV3Row ? (checkV3.getAsObject() as { cnt: number }).cnt : 0;
    checkV3.free();
    if (v3cnt === 0) {
      for (const stmt of MIGRATE_V3.split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        db.run(stmt);
      }
    }

    return new BrowserSqliteRepository(db, storeName);
  }

  /** Persist the current database state to IndexedDB. */
  private async persist(): Promise<void> {
    if (typeof indexedDB !== 'undefined') {
      await saveToIDB(this.storeName, this.db.export());
    }
  }

  /** Execute a write statement and persist. */
  private async run(sql: string, params: unknown[] = []): Promise<void> {
    this.db.run(sql, params as (string | number | null | Uint8Array)[]);
    await this.persist();
  }

  /** Execute a SELECT and return all matching rows as objects. */
  private all<T>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params as (string | number | null | Uint8Array)[]);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  /** Execute a SELECT and return the first row, or undefined. */
  private get<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  async getTree(treeId: string): Promise<Tree> {
    const row = this.get<TreeRow>('SELECT * FROM trees WHERE tree_id = ?', [treeId]);
    if (!row) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return rowToTree(row);
  }

  async listTrees(): Promise<Tree[]> {
    const rows = this.all<TreeRow>('SELECT * FROM trees');
    return rows.map(rowToTree);
  }

  async putTree(tree: Tree): Promise<void> {
    await this.run(
      `INSERT INTO trees (tree_id, title, created_at, root_node_id, context_sources)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(tree_id) DO UPDATE SET
         title = excluded.title,
         created_at = excluded.created_at,
         root_node_id = excluded.root_node_id,
         context_sources = excluded.context_sources`,
      [
        tree.treeId,
        tree.title,
        tree.createdAt,
        tree.rootNodeId,
        tree.contextSources ? JSON.stringify(tree.contextSources) : null,
      ],
    );
  }

  async getNode(nodeId: string): Promise<Node> {
    const row = this.get<NodeRow>(
      `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
              n.content, n.is_deleted, n.created_at, n.model_name,
              n.provider, n.token_count, n.embedding_model,
              n.metadata, n.author
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
    const rows = this.all<NodeRow>(
      `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
              n.content, n.is_deleted, n.created_at, n.model_name,
              n.provider, n.token_count, n.embedding_model,
              n.metadata, n.author
       FROM nodes n
       JOIN node_types nt ON nt.id = n.node_type_id
       WHERE n.tree_id = ?`,
      [treeId],
    );
    return rows.map(rowToNode);
  }

  async putNode(node: Node): Promise<void> {
    await this.run(
      `INSERT INTO nodes (node_id, tree_id, parent_id, node_type_id, content, is_deleted, created_at, model_name, provider, token_count, embedding_model, metadata, author)
       VALUES (?, ?, ?, (SELECT id FROM node_types WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    const before = this.get<{ node_id: string }>('SELECT node_id FROM nodes WHERE node_id = ?', [
      nodeId,
    ]);
    if (!before) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    await this.run('UPDATE nodes SET is_deleted = 1 WHERE node_id = ?', [nodeId]);
  }

  async deleteTree(treeId: string): Promise<void> {
    const tree = this.get<{ tree_id: string }>('SELECT tree_id FROM trees WHERE tree_id = ?', [
      treeId,
    ]);
    if (!tree) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    await this.run('DELETE FROM nodes WHERE tree_id = ?', [treeId]);
    await this.run('DELETE FROM trees WHERE tree_id = ?', [treeId]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: browser SQLite backend does not support embeddings
  }

  async searchNodes(options: SearchOptions): Promise<SearchResult[]> {
    const conditions = ["n.content LIKE '%' || ? || '%' COLLATE NOCASE"];
    const params: unknown[] = [options.query];

    if (!options.includeDeleted) {
      conditions.push('n.is_deleted = 0');
    }
    if (options.treeId) {
      conditions.push('n.tree_id = ?');
      params.push(options.treeId);
    }
    if (options.nodeTypes && options.nodeTypes.length > 0) {
      const placeholders = options.nodeTypes.map(() => '?').join(', ');
      conditions.push(`nt.name IN (${placeholders})`);
      params.push(...options.nodeTypes);
    }

    const sql = `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                        n.content, n.is_deleted, n.created_at, n.model_name,
                        n.provider, n.token_count, n.embedding_model,
                        n.metadata, n.author, t.title AS tree_title
                 FROM nodes n
                 JOIN node_types nt ON nt.id = n.node_type_id
                 JOIN trees t ON t.tree_id = n.tree_id
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY n.created_at DESC`;

    const rows = this.all<NodeRow & { tree_title: string }>(sql, params);
    return rows.map((row) => ({ node: rowToNode(row), treeTitle: row.tree_title }));
  }

  async searchTrees(query: string): Promise<Tree[]> {
    const rows = this.all<TreeRow>(
      "SELECT * FROM trees WHERE title LIKE '%' || ? || '%' COLLATE NOCASE ORDER BY created_at DESC",
      [query],
    );
    return rows.map(rowToTree);
  }
}
