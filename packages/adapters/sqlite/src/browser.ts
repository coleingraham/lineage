import type {
  Node,
  NodeRepository,
  Tag,
  TagCategory,
  Tree,
  SearchOptions,
  SearchResult,
  SemanticSearchResult,
} from '@lineage/core';
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

const MIGRATE_V4 = `
CREATE TABLE IF NOT EXISTS tag_categories (
  category_id  TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tags (
  tag_id       TEXT PRIMARY KEY,
  category_id  TEXT NOT NULL REFERENCES tag_categories(category_id),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  UNIQUE(category_id, name)
);
CREATE TABLE IF NOT EXISTS node_tags (
  node_id  TEXT NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, tag_id)
);
CREATE TABLE IF NOT EXISTS tree_tags (
  tree_id  TEXT NOT NULL REFERENCES trees(tree_id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (tree_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category_id);
CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tree_tags_tag ON tree_tags(tag_id);
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

interface TagCategoryRow {
  category_id: string;
  name: string;
  description: string;
  created_at: string;
}

interface TagRow {
  tag_id: string;
  category_id: string;
  name: string;
  description: string;
  created_at: string;
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

function rowToTagCategory(row: TagCategoryRow): TagCategory {
  return {
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

function rowToTag(row: TagRow): Tag {
  return {
    tagId: row.tag_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
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

    // V4: add tagging tables (tag_categories, tags, node_tags, tree_tags)
    const checkV4 = db.prepare(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name = 'tag_categories'",
    );
    const hasV4Row = checkV4.step();
    const v4cnt = hasV4Row ? (checkV4.getAsObject() as { cnt: number }).cnt : 0;
    checkV4.free();
    if (v4cnt === 0) {
      for (const stmt of MIGRATE_V4.split(';')
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
    await this.run(
      'DELETE FROM node_tags WHERE node_id IN (SELECT node_id FROM nodes WHERE tree_id = ?)',
      [treeId],
    );
    await this.run('DELETE FROM tree_tags WHERE tree_id = ?', [treeId]);
    await this.run('DELETE FROM nodes WHERE tree_id = ?', [treeId]);
    await this.run('DELETE FROM trees WHERE tree_id = ?', [treeId]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: browser SQLite backend does not support embeddings
  }

  async semanticSearch(): Promise<SemanticSearchResult[]> {
    throw new Error('Semantic search is not supported by the browser SQLite backend');
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

  // ── Tag category CRUD ──────────────────────────────────────────────────

  async createCategory(category: TagCategory): Promise<void> {
    await this.run(
      `INSERT INTO tag_categories (category_id, name, description, created_at)
       VALUES (?, ?, ?, ?)`,
      [category.categoryId, category.name, category.description, category.createdAt],
    );
  }

  async getCategory(categoryId: string): Promise<TagCategory> {
    const row = this.get<TagCategoryRow>('SELECT * FROM tag_categories WHERE category_id = ?', [
      categoryId,
    ]);
    if (!row) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    return rowToTagCategory(row);
  }

  async listCategories(): Promise<TagCategory[]> {
    const rows = this.all<TagCategoryRow>('SELECT * FROM tag_categories');
    return rows.map(rowToTagCategory);
  }

  async updateCategory(
    categoryId: string,
    fields: { name?: string; description?: string },
  ): Promise<void> {
    const existing = this.get<TagCategoryRow>(
      'SELECT * FROM tag_categories WHERE category_id = ?',
      [categoryId],
    );
    if (!existing) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    const setClauses: string[] = [];
    const params: unknown[] = [];
    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      params.push(fields.name);
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?');
      params.push(fields.description);
    }
    if (setClauses.length === 0) return;
    params.push(categoryId);
    await this.run(
      `UPDATE tag_categories SET ${setClauses.join(', ')} WHERE category_id = ?`,
      params,
    );
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const existing = this.get<TagCategoryRow>(
      'SELECT * FROM tag_categories WHERE category_id = ?',
      [categoryId],
    );
    if (!existing) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    const tags = this.all<TagRow>('SELECT * FROM tags WHERE category_id = ?', [categoryId]);
    if (tags.length > 0) {
      throw new Error('Cannot delete category: it still has tags');
    }
    await this.run('DELETE FROM tag_categories WHERE category_id = ?', [categoryId]);
  }

  // ── Tag CRUD ───────────────────────────────────────────────────────────

  async createTag(tag: Tag): Promise<void> {
    await this.run(
      `INSERT INTO tags (tag_id, category_id, name, description, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [tag.tagId, tag.categoryId, tag.name, tag.description, tag.createdAt],
    );
  }

  async getTag(tagId: string): Promise<Tag> {
    const row = this.get<TagRow>('SELECT * FROM tags WHERE tag_id = ?', [tagId]);
    if (!row) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    return rowToTag(row);
  }

  async listTags(categoryId?: string): Promise<Tag[]> {
    if (categoryId !== undefined) {
      const rows = this.all<TagRow>('SELECT * FROM tags WHERE category_id = ?', [categoryId]);
      return rows.map(rowToTag);
    }
    const rows = this.all<TagRow>('SELECT * FROM tags');
    return rows.map(rowToTag);
  }

  async updateTag(tagId: string, fields: { name?: string; description?: string }): Promise<void> {
    const existing = this.get<TagRow>('SELECT * FROM tags WHERE tag_id = ?', [tagId]);
    if (!existing) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    const setClauses: string[] = [];
    const params: unknown[] = [];
    if (fields.name !== undefined) {
      setClauses.push('name = ?');
      params.push(fields.name);
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?');
      params.push(fields.description);
    }
    if (setClauses.length === 0) return;
    params.push(tagId);
    await this.run(`UPDATE tags SET ${setClauses.join(', ')} WHERE tag_id = ?`, params);
  }

  async deleteTag(tagId: string): Promise<void> {
    const existing = this.get<TagRow>('SELECT * FROM tags WHERE tag_id = ?', [tagId]);
    if (!existing) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    await this.run('DELETE FROM node_tags WHERE tag_id = ?', [tagId]);
    await this.run('DELETE FROM tree_tags WHERE tag_id = ?', [tagId]);
    await this.run('DELETE FROM tags WHERE tag_id = ?', [tagId]);
  }

  // ── Tagging operations ─────────────────────────────────────────────────

  async tagNode(nodeId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      await this.run('INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)', [
        nodeId,
        tagId,
      ]);
    }
  }

  async untagNode(nodeId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      await this.run('DELETE FROM node_tags WHERE node_id = ? AND tag_id = ?', [nodeId, tagId]);
    }
  }

  async getNodeTags(nodeId: string): Promise<Tag[]> {
    const rows = this.all<TagRow>(
      `SELECT t.tag_id, t.category_id, t.name, t.description, t.created_at
       FROM tags t
       JOIN node_tags nt ON nt.tag_id = t.tag_id
       WHERE nt.node_id = ?`,
      [nodeId],
    );
    return rows.map(rowToTag);
  }

  async tagTree(treeId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      await this.run('INSERT OR IGNORE INTO tree_tags (tree_id, tag_id) VALUES (?, ?)', [
        treeId,
        tagId,
      ]);
    }
  }

  async untagTree(treeId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      await this.run('DELETE FROM tree_tags WHERE tree_id = ? AND tag_id = ?', [treeId, tagId]);
    }
  }

  async getTreeTags(treeId: string): Promise<Tag[]> {
    const rows = this.all<TagRow>(
      `SELECT t.tag_id, t.category_id, t.name, t.description, t.created_at
       FROM tags t
       JOIN tree_tags tt ON tt.tag_id = t.tag_id
       WHERE tt.tree_id = ?`,
      [treeId],
    );
    return rows.map(rowToTag);
  }

  // ── Tag-based queries ──────────────────────────────────────────────────

  async findNodesByTags(
    tagIds: string[],
    options?: { treeId?: string; matchAll?: boolean },
  ): Promise<Node[]> {
    if (tagIds.length === 0) return [];
    const placeholders = tagIds.map(() => '?').join(', ');
    const matchAll = options?.matchAll ?? true;
    const params: unknown[] = [...tagIds];
    if (matchAll) params.push(tagIds.length);
    let treeFilter = '';
    if (options?.treeId) {
      treeFilter = ' AND n.tree_id = ?';
      params.push(options.treeId);
    }
    const having = matchAll ? '\n                 HAVING COUNT(DISTINCT ntg.tag_id) = ?' : '';
    const sql = `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                        n.content, n.is_deleted, n.created_at, n.model_name,
                        n.provider, n.token_count, n.embedding_model,
                        n.metadata, n.author
                 FROM nodes n
                 JOIN node_types nt ON nt.id = n.node_type_id
                 JOIN node_tags ntg ON ntg.node_id = n.node_id
                 WHERE ntg.tag_id IN (${placeholders})
                   AND n.is_deleted = 0${treeFilter}
                 GROUP BY n.node_id${having}`;
    const rows = this.all<NodeRow>(sql, params);
    return rows.map(rowToNode);
  }

  async findTreesByTags(tagIds: string[], options?: { matchAll?: boolean }): Promise<Tree[]> {
    if (tagIds.length === 0) return [];
    const placeholders = tagIds.map(() => '?').join(', ');
    const matchAll = options?.matchAll ?? true;
    const having = matchAll ? '\n                 HAVING COUNT(DISTINCT tt.tag_id) = ?' : '';
    const params: unknown[] = matchAll ? [...tagIds, tagIds.length] : [...tagIds];
    const sql = `SELECT tr.tree_id, tr.title, tr.created_at, tr.root_node_id, tr.context_sources
                 FROM trees tr
                 JOIN tree_tags tt ON tt.tree_id = tr.tree_id
                 WHERE tt.tag_id IN (${placeholders})
                 GROUP BY tr.tree_id${having}`;
    const rows = this.all<TreeRow>(sql, params);
    return rows.map(rowToTree);
  }
}
