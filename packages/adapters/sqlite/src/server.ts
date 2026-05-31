import type Database from 'better-sqlite3';
import type {
  Node,
  NodeRepository,
  Tree,
  Tag,
  TagCategory,
  ContextSource,
  CrossTreeRef,
  CrossTreeRefQuery,
  SearchOptions,
  SearchResult,
  SemanticSearchResult,
} from '@lineage/core';
import { CROSS_TREE_REF_KINDS } from '@lineage/core';
import { runMigrations } from './migrations/index.js';

interface CrossTreeRefRow {
  from_tree_id: string;
  from_node_id: string | null;
  to_tree_id: string;
  to_node_id: string;
  kind: string;
  live: number;
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
  // contextSources are sourced from the unified cross_tree_refs table, not the
  // legacy context_sources column — see fillContextSources / migration V5.
  return {
    treeId: row.tree_id,
    title: row.title,
    createdAt: row.created_at,
    rootNodeId: row.root_node_id,
    contextSources: null,
  };
}

interface CategoryRow {
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

function rowToCategory(row: CategoryRow): TagCategory {
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

export class SqliteRepository implements NodeRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
  }

  /** Attach contextSources (from cross_tree_refs) to a base tree. */
  private fillContextSources(tree: Tree): Tree {
    const rows = this.db
      .prepare<
        [string, string],
        { to_tree_id: string; to_node_id: string }
      >('SELECT to_tree_id, to_node_id FROM cross_tree_refs WHERE from_tree_id = ? AND from_node_id IS NULL AND kind = ?')
      .all(tree.treeId, CROSS_TREE_REF_KINDS.CONTEXT_SOURCE);
    const contextSources: ContextSource[] = rows.map((r) => ({
      treeId: r.to_tree_id,
      nodeId: r.to_node_id,
    }));
    return { ...tree, contextSources: contextSources.length > 0 ? contextSources : null };
  }

  /** Replace a tree's tree-owned context_source refs to match `contextSources`. */
  private syncContextSources(treeId: string, contextSources: ContextSource[] | null): void {
    this.db
      .prepare(
        'DELETE FROM cross_tree_refs WHERE from_tree_id = ? AND from_node_id IS NULL AND kind = ?',
      )
      .run(treeId, CROSS_TREE_REF_KINDS.CONTEXT_SOURCE);
    const insert = this.db.prepare(
      `INSERT INTO cross_tree_refs (from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live)
       VALUES (?, NULL, ?, ?, ?, 1)`,
    );
    for (const cs of contextSources ?? []) {
      insert.run(treeId, cs.treeId, cs.nodeId, CROSS_TREE_REF_KINDS.CONTEXT_SOURCE);
    }
  }

  async getTree(treeId: string): Promise<Tree> {
    const row = this.db
      .prepare<[string], TreeRow>('SELECT * FROM trees WHERE tree_id = ?')
      .get(treeId);
    if (!row) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return this.fillContextSources(rowToTree(row));
  }

  async listTrees(): Promise<Tree[]> {
    const rows = this.db.prepare<[], TreeRow>('SELECT * FROM trees').all();
    return rows.map((row) => this.fillContextSources(rowToTree(row)));
  }

  async putTree(tree: Tree): Promise<void> {
    // The legacy context_sources column is left NULL; contextSources live in
    // the unified cross_tree_refs table.
    this.db
      .prepare(
        `INSERT INTO trees (tree_id, title, created_at, root_node_id, context_sources)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(tree_id) DO UPDATE SET
           title = excluded.title,
           created_at = excluded.created_at,
           root_node_id = excluded.root_node_id`,
      )
      .run(tree.treeId, tree.title, tree.createdAt, tree.rootNodeId);
    this.syncContextSources(tree.treeId, tree.contextSources);
  }

  async getNode(nodeId: string): Promise<Node> {
    const row = this.db
      .prepare<[string], NodeRow>(
        `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                n.content, n.is_deleted, n.created_at, n.model_name,
                n.provider, n.token_count, n.embedding_model,
                n.metadata, n.author, bi.name AS intent
         FROM nodes n
         JOIN node_types nt ON nt.id = n.node_type_id
         LEFT JOIN branch_intents bi ON bi.id = n.intent_id
         WHERE n.node_id = ?`,
      )
      .get(nodeId);
    if (!row) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return rowToNode(row);
  }

  async getNodes(treeId: string): Promise<Node[]> {
    const rows = this.db
      .prepare<[string], NodeRow>(
        `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                n.content, n.is_deleted, n.created_at, n.model_name,
                n.provider, n.token_count, n.embedding_model,
                n.metadata, n.author, bi.name AS intent
         FROM nodes n
         JOIN node_types nt ON nt.id = n.node_type_id
         LEFT JOIN branch_intents bi ON bi.id = n.intent_id
         WHERE n.tree_id = ?`,
      )
      .all(treeId);
    return rows.map(rowToNode);
  }

  async putNode(node: Node): Promise<void> {
    this.db
      .prepare(
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
        node.metadata ? JSON.stringify(node.metadata) : null,
        node.author,
        node.intent,
      );
  }

  async softDeleteNode(nodeId: string): Promise<void> {
    const result = this.db.prepare('UPDATE nodes SET is_deleted = 1 WHERE node_id = ?').run(nodeId);
    if (result.changes === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
  }

  async deleteTree(treeId: string): Promise<void> {
    this.db
      .prepare(
        'DELETE FROM node_tags WHERE node_id IN (SELECT node_id FROM nodes WHERE tree_id = ?)',
      )
      .run(treeId);
    this.db.prepare('DELETE FROM tree_tags WHERE tree_id = ?').run(treeId);
    this.db.prepare('DELETE FROM cross_tree_refs WHERE from_tree_id = ?').run(treeId);
    this.db.prepare('DELETE FROM nodes WHERE tree_id = ?').run(treeId);
    const result = this.db.prepare('DELETE FROM trees WHERE tree_id = ?').run(treeId);
    if (result.changes === 0) {
      throw new Error(`Tree not found: ${treeId}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    // No-op: SQLite backend does not support embeddings
  }

  async semanticSearch(): Promise<SemanticSearchResult[]> {
    throw new Error('Semantic search is not supported by the SQLite backend');
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

    const rows = this.db.prepare(sql).all(...params) as (NodeRow & { tree_title: string })[];
    return rows.map((row) => ({ node: rowToNode(row), treeTitle: row.tree_title }));
  }

  async searchTrees(query: string): Promise<Tree[]> {
    const rows = this.db
      .prepare<
        [string],
        TreeRow
      >("SELECT * FROM trees WHERE title LIKE '%' || ? || '%' COLLATE NOCASE ORDER BY created_at DESC")
      .all(query);
    return rows.map((row) => this.fillContextSources(rowToTree(row)));
  }

  // ── Tag category CRUD ──

  async createCategory(category: TagCategory): Promise<void> {
    try {
      this.db
        .prepare(
          `INSERT INTO tag_categories (category_id, name, description, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(category.categoryId, category.name, category.description, category.createdAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('UNIQUE constraint failed')) {
        throw new Error(`Category already exists: ${category.name}`, { cause: err });
      }
      throw err;
    }
  }

  async getCategory(categoryId: string): Promise<TagCategory> {
    const row = this.db
      .prepare<[string], CategoryRow>('SELECT * FROM tag_categories WHERE category_id = ?')
      .get(categoryId);
    if (!row) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    return rowToCategory(row);
  }

  async listCategories(): Promise<TagCategory[]> {
    const rows = this.db.prepare<[], CategoryRow>('SELECT * FROM tag_categories').all();
    return rows.map(rowToCategory);
  }

  async updateCategory(
    categoryId: string,
    fields: { name?: string; description?: string },
  ): Promise<void> {
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
    const result = this.db
      .prepare(`UPDATE tag_categories SET ${setClauses.join(', ')} WHERE category_id = ?`)
      .run(...params);
    if (result.changes === 0) {
      throw new Error(`Category not found: ${categoryId}`);
    }
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const tagCount = this.db
      .prepare<[string], { cnt: number }>('SELECT COUNT(*) AS cnt FROM tags WHERE category_id = ?')
      .get(categoryId);
    if (tagCount && tagCount.cnt > 0) {
      throw new Error(`Cannot delete category ${categoryId}: it still has ${tagCount.cnt} tag(s)`);
    }
    const result = this.db
      .prepare('DELETE FROM tag_categories WHERE category_id = ?')
      .run(categoryId);
    if (result.changes === 0) {
      throw new Error(`Category not found: ${categoryId}`);
    }
  }

  // ── Tag CRUD ──

  async createTag(tag: Tag): Promise<void> {
    try {
      this.db
        .prepare(
          `INSERT INTO tags (tag_id, category_id, name, description, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(tag.tagId, tag.categoryId, tag.name, tag.description, tag.createdAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('UNIQUE constraint failed')) {
        throw new Error(`Tag already exists: ${tag.name} in category ${tag.categoryId}`, {
          cause: err,
        });
      }
      throw err;
    }
  }

  async getTag(tagId: string): Promise<Tag> {
    const row = this.db.prepare<[string], TagRow>('SELECT * FROM tags WHERE tag_id = ?').get(tagId);
    if (!row) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    return rowToTag(row);
  }

  async listTags(categoryId?: string): Promise<Tag[]> {
    if (categoryId) {
      const rows = this.db
        .prepare<[string], TagRow>('SELECT * FROM tags WHERE category_id = ?')
        .all(categoryId);
      return rows.map(rowToTag);
    }
    const rows = this.db.prepare<[], TagRow>('SELECT * FROM tags').all();
    return rows.map(rowToTag);
  }

  async updateTag(tagId: string, fields: { name?: string; description?: string }): Promise<void> {
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
    const result = this.db
      .prepare(`UPDATE tags SET ${setClauses.join(', ')} WHERE tag_id = ?`)
      .run(...params);
    if (result.changes === 0) {
      throw new Error(`Tag not found: ${tagId}`);
    }
  }

  async deleteTag(tagId: string): Promise<void> {
    const result = this.db.prepare('DELETE FROM tags WHERE tag_id = ?').run(tagId);
    if (result.changes === 0) {
      throw new Error(`Tag not found: ${tagId}`);
    }
  }

  // ── Tagging operations ──

  async tagNode(nodeId: string, tagIds: string[]): Promise<void> {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)');
    const insertMany = this.db.transaction((ids: string[]) => {
      for (const tagId of ids) {
        stmt.run(nodeId, tagId);
      }
    });
    insertMany(tagIds);
  }

  async untagNode(nodeId: string, tagIds: string[]): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM node_tags WHERE node_id = ? AND tag_id = ?');
    const deleteMany = this.db.transaction((ids: string[]) => {
      for (const tagId of ids) {
        stmt.run(nodeId, tagId);
      }
    });
    deleteMany(tagIds);
  }

  async getNodeTags(nodeId: string): Promise<Tag[]> {
    const rows = this.db
      .prepare<[string], TagRow>(
        `SELECT t.* FROM tags t
         JOIN node_tags nt ON nt.tag_id = t.tag_id
         WHERE nt.node_id = ?`,
      )
      .all(nodeId);
    return rows.map(rowToTag);
  }

  async tagTree(treeId: string, tagIds: string[]): Promise<void> {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO tree_tags (tree_id, tag_id) VALUES (?, ?)');
    const insertMany = this.db.transaction((ids: string[]) => {
      for (const tagId of ids) {
        stmt.run(treeId, tagId);
      }
    });
    insertMany(tagIds);
  }

  async untagTree(treeId: string, tagIds: string[]): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM tree_tags WHERE tree_id = ? AND tag_id = ?');
    const deleteMany = this.db.transaction((ids: string[]) => {
      for (const tagId of ids) {
        stmt.run(treeId, tagId);
      }
    });
    deleteMany(tagIds);
  }

  async getTreeTags(treeId: string): Promise<Tag[]> {
    const rows = this.db
      .prepare<[string], TagRow>(
        `SELECT t.* FROM tags t
         JOIN tree_tags tt ON tt.tag_id = t.tag_id
         WHERE tt.tree_id = ?`,
      )
      .all(treeId);
    return rows.map(rowToTag);
  }

  // ── Tag-based queries ──

  async findNodesByTags(
    tagIds: string[],
    options?: { treeId?: string; matchAll?: boolean },
  ): Promise<Node[]> {
    const placeholders = tagIds.map(() => '?').join(', ');
    const params: unknown[] = [...tagIds];
    const matchAll = options?.matchAll ?? true;

    let whereExtra = '';
    if (options?.treeId) {
      whereExtra = ' AND n.tree_id = ?';
      params.push(options.treeId);
    }

    let having = '';
    if (matchAll) {
      having = ' HAVING COUNT(DISTINCT ntg.tag_id) = ?';
      params.push(tagIds.length);
    }

    const rows = this.db
      .prepare(
        `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                n.content, n.is_deleted, n.created_at, n.model_name,
                n.provider, n.token_count, n.embedding_model,
                n.metadata, n.author, bi.name AS intent
         FROM nodes n
         JOIN node_types nt ON nt.id = n.node_type_id
         LEFT JOIN branch_intents bi ON bi.id = n.intent_id
         JOIN node_tags ntg ON ntg.node_id = n.node_id
         WHERE ntg.tag_id IN (${placeholders})${whereExtra}
         GROUP BY n.node_id${having}`,
      )
      .all(...params) as NodeRow[];
    return rows.map(rowToNode);
  }

  async findTreesByTags(tagIds: string[], options?: { matchAll?: boolean }): Promise<Tree[]> {
    const placeholders = tagIds.map(() => '?').join(', ');
    const matchAll = options?.matchAll ?? true;

    const params: unknown[] = [...tagIds];
    let having = '';
    if (matchAll) {
      having = ' HAVING COUNT(DISTINCT tt.tag_id) = ?';
      params.push(tagIds.length);
    }

    const rows = this.db
      .prepare(
        `SELECT t.*
         FROM trees t
         JOIN tree_tags tt ON tt.tree_id = t.tree_id
         WHERE tt.tag_id IN (${placeholders})
         GROUP BY t.tree_id${having}`,
      )
      .all(...params) as TreeRow[];
    return rows.map((row) => this.fillContextSources(rowToTree(row)));
  }

  // ── Cross-tree references ──────────────────────────────────────────────

  async putCrossTreeRef(ref: CrossTreeRef): Promise<void> {
    // Delete-then-insert keyed on the full tuple (NULL from_node_id makes a
    // UNIQUE index awkward, so upsert manually).
    this.deleteRefExact(ref);
    this.db
      .prepare(
        `INSERT INTO cross_tree_refs (from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(ref.fromTreeId, ref.fromNodeId, ref.toTreeId, ref.toNodeId, ref.kind, ref.live ? 1 : 0);
  }

  private deleteRefExact(ref: CrossTreeRef): void {
    this.db
      .prepare(
        `DELETE FROM cross_tree_refs
         WHERE from_tree_id = ? AND from_node_id IS ? AND to_tree_id = ?
           AND to_node_id = ? AND kind = ?`,
      )
      .run(ref.fromTreeId, ref.fromNodeId, ref.toTreeId, ref.toNodeId, ref.kind);
  }

  async getCrossTreeRefs(query?: CrossTreeRefQuery): Promise<CrossTreeRef[]> {
    const { sql, params } = buildRefWhere(query);
    const rows = this.db
      .prepare(`SELECT * FROM cross_tree_refs${sql}`)
      .all(...params) as CrossTreeRefRow[];
    return rows.map(rowToCrossTreeRef);
  }

  async deleteCrossTreeRefs(query: CrossTreeRefQuery): Promise<number> {
    const { sql, params } = buildRefWhere(query);
    const result = this.db.prepare(`DELETE FROM cross_tree_refs${sql}`).run(...params);
    return result.changes;
  }
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
    // `IS` matches NULL correctly when fromNodeId is null.
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
