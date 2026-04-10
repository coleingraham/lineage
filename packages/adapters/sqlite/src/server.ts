import type Database from 'better-sqlite3';
import type {
  Node,
  NodeRepository,
  Tree,
  Tag,
  TagCategory,
  SearchOptions,
  SearchResult,
} from '@lineage/core';
import { runMigrations } from './migrations/index.js';

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

  async getTree(treeId: string): Promise<Tree> {
    const row = this.db
      .prepare<[string], TreeRow>('SELECT * FROM trees WHERE tree_id = ?')
      .get(treeId);
    if (!row) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return rowToTree(row);
  }

  async listTrees(): Promise<Tree[]> {
    const rows = this.db.prepare<[], TreeRow>('SELECT * FROM trees').all();
    return rows.map(rowToTree);
  }

  async putTree(tree: Tree): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO trees (tree_id, title, created_at, root_node_id, context_sources)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(tree_id) DO UPDATE SET
           title = excluded.title,
           created_at = excluded.created_at,
           root_node_id = excluded.root_node_id,
           context_sources = excluded.context_sources`,
      )
      .run(
        tree.treeId,
        tree.title,
        tree.createdAt,
        tree.rootNodeId,
        tree.contextSources ? JSON.stringify(tree.contextSources) : null,
      );
  }

  async getNode(nodeId: string): Promise<Node> {
    const row = this.db
      .prepare<[string], NodeRow>(
        `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                n.content, n.is_deleted, n.created_at, n.model_name,
                n.provider, n.token_count, n.embedding_model,
                n.metadata, n.author
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

  async getNodes(treeId: string): Promise<Node[]> {
    const rows = this.db
      .prepare<[string], NodeRow>(
        `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                n.content, n.is_deleted, n.created_at, n.model_name,
                n.provider, n.token_count, n.embedding_model,
                n.metadata, n.author
         FROM nodes n
         JOIN node_types nt ON nt.id = n.node_type_id
         WHERE n.tree_id = ?`,
      )
      .all(treeId);
    return rows.map(rowToNode);
  }

  async putNode(node: Node): Promise<void> {
    this.db
      .prepare(
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
    return rows.map(rowToTree);
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

  async findNodesByTags(tagIds: string[], options?: { treeId?: string }): Promise<Node[]> {
    const placeholders = tagIds.map(() => '?').join(', ');
    const params: unknown[] = [...tagIds];

    let whereExtra = '';
    if (options?.treeId) {
      whereExtra = ' AND n.tree_id = ?';
      params.push(options.treeId);
    }

    params.push(tagIds.length);

    const rows = this.db
      .prepare(
        `SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
                n.content, n.is_deleted, n.created_at, n.model_name,
                n.provider, n.token_count, n.embedding_model,
                n.metadata, n.author
         FROM nodes n
         JOIN node_types nt ON nt.id = n.node_type_id
         JOIN node_tags ntg ON ntg.node_id = n.node_id
         WHERE ntg.tag_id IN (${placeholders})${whereExtra}
         GROUP BY n.node_id
         HAVING COUNT(DISTINCT ntg.tag_id) = ?`,
      )
      .all(...params) as NodeRow[];
    return rows.map(rowToNode);
  }

  async findTreesByTags(tagIds: string[]): Promise<Tree[]> {
    const placeholders = tagIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT t.*
         FROM trees t
         JOIN tree_tags tt ON tt.tree_id = t.tree_id
         WHERE tt.tag_id IN (${placeholders})
         GROUP BY t.tree_id
         HAVING COUNT(DISTINCT tt.tag_id) = ?`,
      )
      .all(...tagIds, tagIds.length) as TreeRow[];
    return rows.map(rowToTree);
  }
}
