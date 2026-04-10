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

const MIGRATE_V2_STMTS = [
  'ALTER TABLE nodes ADD COLUMN metadata TEXT',
  'ALTER TABLE nodes ADD COLUMN author TEXT',
  "INSERT OR IGNORE INTO node_types (id, name) VALUES (4, 'system'), (5, 'tool_call'), (6, 'tool_result')",
];

const MIGRATE_V3_STMTS = ['ALTER TABLE trees ADD COLUMN context_sources TEXT'];

const MIGRATE_V4_STMTS = [
  `CREATE TABLE IF NOT EXISTS tag_categories (
    category_id  TEXT PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    description  TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    tag_id       TEXT PRIMARY KEY,
    category_id  TEXT NOT NULL REFERENCES tag_categories(category_id),
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    UNIQUE(category_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS node_tags (
    node_id  TEXT NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
    PRIMARY KEY (node_id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tree_tags (
    tree_id  TEXT NOT NULL REFERENCES trees(tree_id) ON DELETE CASCADE,
    tag_id   TEXT NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
    PRIMARY KEY (tree_id, tag_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category_id)',
  'CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag_id)',
  'CREATE INDEX IF NOT EXISTS idx_tree_tags_tag ON tree_tags(tag_id)',
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

    // V3: add context_sources column to trees
    const treeCols = await db.select<{ name: string }[]>(
      "SELECT name FROM pragma_table_info('trees') WHERE name = 'context_sources'",
    );
    if (treeCols.length === 0) {
      for (const stmt of MIGRATE_V3_STMTS) {
        await db.execute(stmt);
      }
    }

    // V4: add tagging tables (tag_categories, tags, node_tags, tree_tags)
    const tagCols = await db.select<{ cnt: number }[]>(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name = 'tag_categories'",
    );
    if (tagCols.length === 0 || tagCols[0].cnt === 0) {
      for (const stmt of MIGRATE_V4_STMTS) {
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
      `INSERT INTO trees (tree_id, title, created_at, root_node_id, context_sources)
       VALUES ($1, $2, $3, $4, $5)
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
    await this.db.execute(
      'DELETE FROM node_tags WHERE node_id IN (SELECT node_id FROM nodes WHERE tree_id = $1)',
      [treeId],
    );
    await this.db.execute('DELETE FROM tree_tags WHERE tree_id = $1', [treeId]);
    await this.db.execute('DELETE FROM nodes WHERE tree_id = $1', [treeId]);
    await this.db.execute('DELETE FROM trees WHERE tree_id = $1', [treeId]);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: Tauri desktop SQLite backend does not support embeddings
  }

  async semanticSearch(): Promise<SemanticSearchResult[]> {
    throw new Error('Semantic search is not supported by the Tauri SQLite backend');
  }

  async searchNodes(options: SearchOptions): Promise<SearchResult[]> {
    const conditions = ["n.content LIKE '%' || $1 || '%' COLLATE NOCASE"];
    const params: unknown[] = [options.query];
    let paramIdx = 2;

    if (!options.includeDeleted) {
      conditions.push('n.is_deleted = 0');
    }
    if (options.treeId) {
      conditions.push(`n.tree_id = $${paramIdx}`);
      params.push(options.treeId);
      paramIdx++;
    }
    if (options.nodeTypes && options.nodeTypes.length > 0) {
      const placeholders = options.nodeTypes.map(() => `$${paramIdx++}`).join(', ');
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

    const rows = await this.db.select<(NodeRow & { tree_title: string })[]>(sql, params);
    return rows.map((row) => ({ node: rowToNode(row), treeTitle: row.tree_title }));
  }

  async searchTrees(query: string): Promise<Tree[]> {
    const rows = await this.db.select<TreeRow[]>(
      "SELECT * FROM trees WHERE title LIKE '%' || $1 || '%' COLLATE NOCASE ORDER BY created_at DESC",
      [query],
    );
    return rows.map(rowToTree);
  }

  // ── Tag category CRUD ──────────────────────────────────────────────────

  async createCategory(category: TagCategory): Promise<void> {
    await this.db.execute(
      `INSERT INTO tag_categories (category_id, name, description, created_at)
       VALUES ($1, $2, $3, $4)`,
      [category.categoryId, category.name, category.description, category.createdAt],
    );
  }

  async getCategory(categoryId: string): Promise<TagCategory> {
    const rows = await this.db.select<TagCategoryRow[]>(
      'SELECT * FROM tag_categories WHERE category_id = $1',
      [categoryId],
    );
    if (rows.length === 0) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    return rowToTagCategory(rows[0]);
  }

  async listCategories(): Promise<TagCategory[]> {
    const rows = await this.db.select<TagCategoryRow[]>('SELECT * FROM tag_categories');
    return rows.map(rowToTagCategory);
  }

  async updateCategory(
    categoryId: string,
    fields: { name?: string; description?: string },
  ): Promise<void> {
    const existing = await this.db.select<TagCategoryRow[]>(
      'SELECT * FROM tag_categories WHERE category_id = $1',
      [categoryId],
    );
    if (existing.length === 0) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    if (fields.name !== undefined) {
      setClauses.push(`name = $${paramIdx}`);
      params.push(fields.name);
      paramIdx++;
    }
    if (fields.description !== undefined) {
      setClauses.push(`description = $${paramIdx}`);
      params.push(fields.description);
      paramIdx++;
    }
    if (setClauses.length === 0) return;
    params.push(categoryId);
    await this.db.execute(
      `UPDATE tag_categories SET ${setClauses.join(', ')} WHERE category_id = $${paramIdx}`,
      params,
    );
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const existing = await this.db.select<TagCategoryRow[]>(
      'SELECT * FROM tag_categories WHERE category_id = $1',
      [categoryId],
    );
    if (existing.length === 0) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    const tags = await this.db.select<TagRow[]>('SELECT * FROM tags WHERE category_id = $1', [
      categoryId,
    ]);
    if (tags.length > 0) {
      throw new Error('Cannot delete category: it still has tags');
    }
    await this.db.execute('DELETE FROM tag_categories WHERE category_id = $1', [categoryId]);
  }

  // ── Tag CRUD ───────────────────────────────────────────────────────────

  async createTag(tag: Tag): Promise<void> {
    await this.db.execute(
      `INSERT INTO tags (tag_id, category_id, name, description, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [tag.tagId, tag.categoryId, tag.name, tag.description, tag.createdAt],
    );
  }

  async getTag(tagId: string): Promise<Tag> {
    const rows = await this.db.select<TagRow[]>('SELECT * FROM tags WHERE tag_id = $1', [tagId]);
    if (rows.length === 0) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    return rowToTag(rows[0]);
  }

  async listTags(categoryId?: string): Promise<Tag[]> {
    if (categoryId !== undefined) {
      const rows = await this.db.select<TagRow[]>('SELECT * FROM tags WHERE category_id = $1', [
        categoryId,
      ]);
      return rows.map(rowToTag);
    }
    const rows = await this.db.select<TagRow[]>('SELECT * FROM tags');
    return rows.map(rowToTag);
  }

  async updateTag(tagId: string, fields: { name?: string; description?: string }): Promise<void> {
    const existing = await this.db.select<TagRow[]>('SELECT * FROM tags WHERE tag_id = $1', [
      tagId,
    ]);
    if (existing.length === 0) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    if (fields.name !== undefined) {
      setClauses.push(`name = $${paramIdx}`);
      params.push(fields.name);
      paramIdx++;
    }
    if (fields.description !== undefined) {
      setClauses.push(`description = $${paramIdx}`);
      params.push(fields.description);
      paramIdx++;
    }
    if (setClauses.length === 0) return;
    params.push(tagId);
    await this.db.execute(
      `UPDATE tags SET ${setClauses.join(', ')} WHERE tag_id = $${paramIdx}`,
      params,
    );
  }

  async deleteTag(tagId: string): Promise<void> {
    const existing = await this.db.select<TagRow[]>('SELECT * FROM tags WHERE tag_id = $1', [
      tagId,
    ]);
    if (existing.length === 0) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    await this.db.execute('DELETE FROM node_tags WHERE tag_id = $1', [tagId]);
    await this.db.execute('DELETE FROM tree_tags WHERE tag_id = $1', [tagId]);
    await this.db.execute('DELETE FROM tags WHERE tag_id = $1', [tagId]);
  }

  // ── Tagging operations ─────────────────────────────────────────────────

  async tagNode(nodeId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      await this.db.execute('INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES ($1, $2)', [
        nodeId,
        tagId,
      ]);
    }
  }

  async untagNode(nodeId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      await this.db.execute('DELETE FROM node_tags WHERE node_id = $1 AND tag_id = $2', [
        nodeId,
        tagId,
      ]);
    }
  }

  async getNodeTags(nodeId: string): Promise<Tag[]> {
    const rows = await this.db.select<TagRow[]>(
      `SELECT t.tag_id, t.category_id, t.name, t.description, t.created_at
       FROM tags t
       JOIN node_tags nt ON nt.tag_id = t.tag_id
       WHERE nt.node_id = $1`,
      [nodeId],
    );
    return rows.map(rowToTag);
  }

  async tagTree(treeId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      await this.db.execute('INSERT OR IGNORE INTO tree_tags (tree_id, tag_id) VALUES ($1, $2)', [
        treeId,
        tagId,
      ]);
    }
  }

  async untagTree(treeId: string, tagIds: string[]): Promise<void> {
    for (const tagId of tagIds) {
      await this.db.execute('DELETE FROM tree_tags WHERE tree_id = $1 AND tag_id = $2', [
        treeId,
        tagId,
      ]);
    }
  }

  async getTreeTags(treeId: string): Promise<Tag[]> {
    const rows = await this.db.select<TagRow[]>(
      `SELECT t.tag_id, t.category_id, t.name, t.description, t.created_at
       FROM tags t
       JOIN tree_tags tt ON tt.tag_id = t.tag_id
       WHERE tt.tree_id = $1`,
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
    const matchAll = options?.matchAll ?? true;
    let paramIdx = 1;
    const placeholders = tagIds.map(() => `$${paramIdx++}`).join(', ');
    const params: unknown[] = [...tagIds];
    let having = '';
    if (matchAll) {
      params.push(tagIds.length);
      const countParam = `$${paramIdx++}`;
      having = `\n                 HAVING COUNT(DISTINCT ntg.tag_id) = ${countParam}`;
    }
    let treeFilter = '';
    if (options?.treeId) {
      treeFilter = ` AND n.tree_id = $${paramIdx++}`;
      params.push(options.treeId);
    }
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
    const rows = await this.db.select<NodeRow[]>(sql, params);
    return rows.map(rowToNode);
  }

  async findTreesByTags(tagIds: string[], options?: { matchAll?: boolean }): Promise<Tree[]> {
    if (tagIds.length === 0) return [];
    const matchAll = options?.matchAll ?? true;
    let paramIdx = 1;
    const placeholders = tagIds.map(() => `$${paramIdx++}`).join(', ');
    const params: unknown[] = [...tagIds];
    let having = '';
    if (matchAll) {
      params.push(tagIds.length);
      const countParam = `$${paramIdx}`;
      having = `\n                 HAVING COUNT(DISTINCT tt.tag_id) = ${countParam}`;
    }
    const sql = `SELECT tr.tree_id, tr.title, tr.created_at, tr.root_node_id, tr.context_sources
                 FROM trees tr
                 JOIN tree_tags tt ON tt.tree_id = tr.tree_id
                 WHERE tt.tag_id IN (${placeholders})
                 GROUP BY tr.tree_id${having}`;
    const rows = await this.db.select<TreeRow[]>(sql, params);
    return rows.map(rowToTree);
  }
}
