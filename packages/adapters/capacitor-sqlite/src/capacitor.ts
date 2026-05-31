import type {
  Node,
  NodeRepository,
  Tag,
  TagCategory,
  Tree,
  ContextSource,
  CrossTreeRef,
  CrossTreeRefQuery,
  SearchOptions,
  SearchResult,
  SemanticSearchResult,
} from '@lineage/core';
import { CROSS_TREE_REF_KINDS } from '@lineage/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';

// Schema is kept identical (in shape) to the @lineage/adapter-sqlite migrations
// so the on-device file matches the shared NodeRepository contract.
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS node_types (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO node_types (id, name) VALUES
  (1, 'human'), (2, 'ai'), (3, 'summary'),
  (4, 'system'), (5, 'tool_call'), (6, 'tool_result');

CREATE TABLE IF NOT EXISTS branch_intents (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO branch_intents (id, name) VALUES
  (1, 'sequence'), (2, 'alternative'), (3, 'elaboration'), (4, 'objection');

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
  author          TEXT,
  intent_id       INTEGER REFERENCES branch_intents(id)
);

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

CREATE TABLE IF NOT EXISTS cross_tree_refs (
  from_tree_id  TEXT NOT NULL,
  from_node_id  TEXT,
  to_tree_id    TEXT NOT NULL,
  to_node_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  live          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_ctr_from ON cross_tree_refs(from_tree_id, from_node_id);
CREATE INDEX IF NOT EXISTS idx_ctr_to ON cross_tree_refs(to_tree_id, to_node_id);
CREATE INDEX IF NOT EXISTS idx_ctr_kind ON cross_tree_refs(kind);
`;

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
  intent: string | null;
}

interface TreeRow {
  tree_id: string;
  title: string;
  created_at: string;
  root_node_id: string;
  context_sources: string | null;
}

interface CrossTreeRefRow {
  from_tree_id: string;
  from_node_id: string | null;
  to_tree_id: string;
  to_node_id: string;
  kind: string;
  live: number;
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
    intent: row.intent ?? null,
  };
}

function rowToTree(row: TreeRow): Tree {
  // contextSources come from the unified cross_tree_refs table.
  return {
    treeId: row.tree_id,
    title: row.title,
    createdAt: row.created_at,
    rootNodeId: row.root_node_id,
    contextSources: null,
  };
}

function rowToCrossTreeRef(row: CrossTreeRefRow): CrossTreeRef {
  return {
    fromTreeId: row.from_tree_id,
    fromNodeId: row.from_node_id,
    toTreeId: row.to_tree_id,
    toNodeId: row.to_node_id,
    kind: row.kind,
    live: row.live === 1,
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

/** Build a parameterized WHERE clause for a cross-tree-ref query. */
function buildRefWhere(query?: CrossTreeRefQuery): { sql: string; params: unknown[] } {
  if (!query) return { sql: '', params: [] };
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.fromTreeId !== undefined) {
    conditions.push('from_tree_id = ?');
    params.push(query.fromTreeId);
  }
  if (query.fromNodeId !== undefined) {
    conditions.push('from_node_id IS ?');
    params.push(query.fromNodeId);
  }
  if (query.toTreeId !== undefined) {
    conditions.push('to_tree_id = ?');
    params.push(query.toTreeId);
  }
  if (query.toNodeId !== undefined) {
    conditions.push('to_node_id = ?');
    params.push(query.toNodeId);
  }
  if (query.kind !== undefined) {
    conditions.push('kind = ?');
    params.push(query.kind);
  }
  return { sql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', params };
}

/**
 * On-device SQLite repository for Capacitor apps, backed by the native
 * `@capacitor-community/sqlite` plugin. File-based storage honours the
 * local-first / data-sovereignty promise (the DB lives on the device and can be
 * backed up), with no server tier.
 *
 * Use the static `create()` factory to instantiate — it opens (or creates) the
 * database connection and runs schema migrations.
 */
export class CapacitorSqliteRepository implements NodeRepository {
  private sqlite: SQLiteConnection;
  private db: SQLiteDBConnection;
  private dbName: string;

  private constructor(sqlite: SQLiteConnection, db: SQLiteDBConnection, dbName: string) {
    this.sqlite = sqlite;
    this.db = db;
    this.dbName = dbName;
  }

  static async create(dbName = 'lineage'): Promise<CapacitorSqliteRepository> {
    const sqlite = new SQLiteConnection(CapacitorSQLite);

    const isConn = (await sqlite.isConnection(dbName, false)).result ?? false;
    const db = isConn
      ? await sqlite.retrieveConnection(dbName, false)
      : await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);

    await db.open();
    await db.execute('PRAGMA foreign_keys = ON;');

    // Capacitor's execute() runs a multi-statement batch, so the full schema
    // (which uses IF NOT EXISTS / INSERT OR IGNORE throughout) is idempotent and
    // safe to run on every launch — covering fresh installs and upgrades alike.
    await db.execute(INIT_SQL);

    return new CapacitorSqliteRepository(sqlite, db, dbName);
  }

  /** Close the underlying connection (call on app teardown). */
  async close(): Promise<void> {
    await this.db.close();
    await this.sqlite.closeConnection(this.dbName, false);
  }

  /** Export the entire database as a JSON document for backup. */
  async exportToJson(): Promise<unknown> {
    const result = await this.db.exportToJson('full');
    return result.export;
  }

  // ── Internal query helpers ────────────────────────────────────────────────

  private async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.db.run(sql, params as never[]);
  }

  private async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.db.query(sql, params as never[]);
    return (result.values ?? []) as T[];
  }

  private async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.all<T>(sql, params))[0];
  }

  /** Attach contextSources (from cross_tree_refs) to a base tree. */
  private async fillContextSources(tree: Tree): Promise<Tree> {
    const rows = await this.all<{ to_tree_id: string; to_node_id: string }>(
      `SELECT to_tree_id, to_node_id FROM cross_tree_refs
       WHERE from_tree_id = ? AND from_node_id IS NULL AND kind = ?`,
      [tree.treeId, CROSS_TREE_REF_KINDS.CONTEXT_SOURCE],
    );
    const contextSources: ContextSource[] = rows.map((r) => ({
      treeId: r.to_tree_id,
      nodeId: r.to_node_id,
    }));
    return { ...tree, contextSources: contextSources.length > 0 ? contextSources : null };
  }

  /** Replace a tree's tree-owned context_source refs to match `contextSources`. */
  private async syncContextSources(
    treeId: string,
    contextSources: ContextSource[] | null,
  ): Promise<void> {
    await this.run(
      'DELETE FROM cross_tree_refs WHERE from_tree_id = ? AND from_node_id IS NULL AND kind = ?',
      [treeId, CROSS_TREE_REF_KINDS.CONTEXT_SOURCE],
    );
    for (const cs of contextSources ?? []) {
      await this.run(
        `INSERT INTO cross_tree_refs (from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live)
         VALUES (?, NULL, ?, ?, ?, 1)`,
        [treeId, cs.treeId, cs.nodeId, CROSS_TREE_REF_KINDS.CONTEXT_SOURCE],
      );
    }
  }

  // ── Trees ─────────────────────────────────────────────────────────────────

  async getTree(treeId: string): Promise<Tree> {
    const row = await this.get<TreeRow>('SELECT * FROM trees WHERE tree_id = ?', [treeId]);
    if (!row) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return this.fillContextSources(rowToTree(row));
  }

  async listTrees(): Promise<Tree[]> {
    const rows = await this.all<TreeRow>('SELECT * FROM trees');
    return Promise.all(rows.map((row) => this.fillContextSources(rowToTree(row))));
  }

  async putTree(tree: Tree): Promise<void> {
    await this.run(
      `INSERT INTO trees (tree_id, title, created_at, root_node_id, context_sources)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(tree_id) DO UPDATE SET
         title = excluded.title,
         created_at = excluded.created_at,
         root_node_id = excluded.root_node_id`,
      [tree.treeId, tree.title, tree.createdAt, tree.rootNodeId],
    );
    await this.syncContextSources(tree.treeId, tree.contextSources);
  }

  // ── Nodes ───────────────────────────────────────────────────────────────

  async getNode(nodeId: string): Promise<Node> {
    const row = await this.get<NodeRow>(
      `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
              n.content, n.is_deleted, n.created_at, n.model_name,
              n.provider, n.token_count, n.embedding_model,
              n.metadata, n.author, bi.name AS intent
       FROM nodes n
       JOIN node_types nt ON nt.id = n.node_type_id
       LEFT JOIN branch_intents bi ON bi.id = n.intent_id
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
              n.provider, n.token_count, n.embedding_model,
              n.metadata, n.author, bi.name AS intent
       FROM nodes n
       JOIN node_types nt ON nt.id = n.node_type_id
       LEFT JOIN branch_intents bi ON bi.id = n.intent_id
       WHERE n.tree_id = ?`,
      [treeId],
    );
    return rows.map(rowToNode);
  }

  async putNode(node: Node): Promise<void> {
    await this.run(
      `INSERT INTO nodes (node_id, tree_id, parent_id, node_type_id, content, is_deleted, created_at, model_name, provider, token_count, embedding_model, metadata, author, intent_id)
       VALUES (?, ?, ?, (SELECT id FROM node_types WHERE name = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM branch_intents WHERE name = ?))
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
         author = excluded.author,
         intent_id = excluded.intent_id`,
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
        node.intent,
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

  async deleteTree(treeId: string): Promise<void> {
    const tree = await this.get<{ tree_id: string }>('SELECT tree_id FROM trees WHERE tree_id = ?', [
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
    await this.run('DELETE FROM cross_tree_refs WHERE from_tree_id = ?', [treeId]);
    await this.run('DELETE FROM nodes WHERE tree_id = ?', [treeId]);
    await this.run('DELETE FROM trees WHERE tree_id = ?', [treeId]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: Capacitor SQLite backend does not support embeddings
  }

  async semanticSearch(): Promise<SemanticSearchResult[]> {
    throw new Error('Semantic search is not supported by the Capacitor SQLite backend');
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
                        n.metadata, n.author, bi.name AS intent, t.title AS tree_title
                 FROM nodes n
                 JOIN node_types nt ON nt.id = n.node_type_id
                 LEFT JOIN branch_intents bi ON bi.id = n.intent_id
                 JOIN trees t ON t.tree_id = n.tree_id
                 WHERE ${conditions.join(' AND ')}
                 ORDER BY n.created_at DESC`;

    const rows = await this.all<NodeRow & { tree_title: string }>(sql, params);
    return rows.map((row) => ({ node: rowToNode(row), treeTitle: row.tree_title }));
  }

  async searchTrees(query: string): Promise<Tree[]> {
    const rows = await this.all<TreeRow>(
      "SELECT * FROM trees WHERE title LIKE '%' || ? || '%' COLLATE NOCASE ORDER BY created_at DESC",
      [query],
    );
    return Promise.all(rows.map((row) => this.fillContextSources(rowToTree(row))));
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
    const row = await this.get<TagCategoryRow>(
      'SELECT * FROM tag_categories WHERE category_id = ?',
      [categoryId],
    );
    if (!row) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    return rowToTagCategory(row);
  }

  async listCategories(): Promise<TagCategory[]> {
    const rows = await this.all<TagCategoryRow>('SELECT * FROM tag_categories');
    return rows.map(rowToTagCategory);
  }

  async updateCategory(
    categoryId: string,
    fields: { name?: string; description?: string },
  ): Promise<void> {
    const existing = await this.get<TagCategoryRow>(
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
    const existing = await this.get<TagCategoryRow>(
      'SELECT * FROM tag_categories WHERE category_id = ?',
      [categoryId],
    );
    if (!existing) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    const tags = await this.all<TagRow>('SELECT * FROM tags WHERE category_id = ?', [categoryId]);
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
    const row = await this.get<TagRow>('SELECT * FROM tags WHERE tag_id = ?', [tagId]);
    if (!row) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    return rowToTag(row);
  }

  async listTags(categoryId?: string): Promise<Tag[]> {
    if (categoryId !== undefined) {
      const rows = await this.all<TagRow>('SELECT * FROM tags WHERE category_id = ?', [categoryId]);
      return rows.map(rowToTag);
    }
    const rows = await this.all<TagRow>('SELECT * FROM tags');
    return rows.map(rowToTag);
  }

  async updateTag(tagId: string, fields: { name?: string; description?: string }): Promise<void> {
    const existing = await this.get<TagRow>('SELECT * FROM tags WHERE tag_id = ?', [tagId]);
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
    const existing = await this.get<TagRow>('SELECT * FROM tags WHERE tag_id = ?', [tagId]);
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
    const rows = await this.all<TagRow>(
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
    const rows = await this.all<TagRow>(
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
    const having = matchAll ? ' HAVING COUNT(DISTINCT ntg.tag_id) = ?' : '';
    const sql = `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                        n.content, n.is_deleted, n.created_at, n.model_name,
                        n.provider, n.token_count, n.embedding_model,
                        n.metadata, n.author, bi.name AS intent
                 FROM nodes n
                 JOIN node_types nt ON nt.id = n.node_type_id
                 LEFT JOIN branch_intents bi ON bi.id = n.intent_id
                 JOIN node_tags ntg ON ntg.node_id = n.node_id
                 WHERE ntg.tag_id IN (${placeholders})
                   AND n.is_deleted = 0${treeFilter}
                 GROUP BY n.node_id${having}`;
    const rows = await this.all<NodeRow>(sql, params);
    return rows.map(rowToNode);
  }

  async findTreesByTags(tagIds: string[], options?: { matchAll?: boolean }): Promise<Tree[]> {
    if (tagIds.length === 0) return [];
    const placeholders = tagIds.map(() => '?').join(', ');
    const matchAll = options?.matchAll ?? true;
    const having = matchAll ? ' HAVING COUNT(DISTINCT tt.tag_id) = ?' : '';
    const params: unknown[] = matchAll ? [...tagIds, tagIds.length] : [...tagIds];
    const sql = `SELECT tr.tree_id, tr.title, tr.created_at, tr.root_node_id, tr.context_sources
                 FROM trees tr
                 JOIN tree_tags tt ON tt.tree_id = tr.tree_id
                 WHERE tt.tag_id IN (${placeholders})
                 GROUP BY tr.tree_id${having}`;
    const rows = await this.all<TreeRow>(sql, params);
    return Promise.all(rows.map((row) => this.fillContextSources(rowToTree(row))));
  }

  // ── Cross-tree references ──────────────────────────────────────────────

  async putCrossTreeRef(ref: CrossTreeRef): Promise<void> {
    await this.run(
      `DELETE FROM cross_tree_refs
       WHERE from_tree_id = ? AND from_node_id IS ? AND to_tree_id = ?
         AND to_node_id = ? AND kind = ?`,
      [ref.fromTreeId, ref.fromNodeId, ref.toTreeId, ref.toNodeId, ref.kind],
    );
    await this.run(
      `INSERT INTO cross_tree_refs (from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ref.fromTreeId, ref.fromNodeId, ref.toTreeId, ref.toNodeId, ref.kind, ref.live ? 1 : 0],
    );
  }

  async getCrossTreeRefs(query?: CrossTreeRefQuery): Promise<CrossTreeRef[]> {
    const { sql, params } = buildRefWhere(query);
    const rows = await this.all<CrossTreeRefRow>(`SELECT * FROM cross_tree_refs${sql}`, params);
    return rows.map(rowToCrossTreeRef);
  }

  async deleteCrossTreeRefs(query: CrossTreeRefQuery): Promise<number> {
    const { sql, params } = buildRefWhere(query);
    const countRows = await this.all<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM cross_tree_refs${sql}`,
      params,
    );
    const removed = countRows[0]?.cnt ?? 0;
    await this.run(`DELETE FROM cross_tree_refs${sql}`, params);
    return removed;
  }
}
