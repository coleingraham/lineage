import type postgres from 'postgres';
import type {
  ContextSource,
  CrossTreeRef,
  CrossTreeRefQuery,
  Node,
  NodeRepository,
  Tree,
  Tag,
  TagCategory,
  SearchOptions,
  SearchResult,
  SemanticSearchOptions,
  SemanticSearchResult,
} from '@lineage/core';
import { CROSS_TREE_REF_KINDS } from '@lineage/core';
import { runMigrations } from './migrations/index.js';

interface NodeRow {
  node_id: string;
  tree_id: string;
  parent_id: string | null;
  type_name: string;
  content: string;
  is_deleted: boolean;
  created_at: string;
  model_name: string | null;
  provider: string | null;
  token_count: number | null;
  embedding_model: string | null;
  metadata: string | Record<string, unknown> | null;
  author: string | null;
  intent: string | null;
}

interface TreeRow {
  tree_id: string;
  title: string;
  created_at: string;
  root_node_id: string;
  context_sources: ContextSource[] | null;
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
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    metadata =
      typeof row.metadata === 'string'
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : row.metadata;
  }
  return {
    nodeId: row.node_id,
    treeId: row.tree_id,
    parentId: row.parent_id,
    type: row.type_name as Node['type'],
    content: row.content,
    isDeleted: row.is_deleted,
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    modelName: row.model_name,
    provider: row.provider,
    tokenCount: row.token_count,
    embeddingModel: row.embedding_model,
    metadata,
    author: row.author,
    intent: row.intent ?? null,
  };
}

function rowToTree(row: TreeRow): Tree {
  // contextSources come from the unified cross_tree_refs table, not the legacy
  // context_sources column — see fillContextSources / migration V5.
  return {
    treeId: row.tree_id,
    title: row.title,
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    rootNodeId: row.root_node_id,
    contextSources: null,
  };
}

interface CrossTreeRefRow {
  from_tree_id: string;
  from_node_id: string | null;
  to_tree_id: string;
  to_node_id: string;
  kind: string;
  live: boolean;
}

function rowToCrossTreeRef(row: CrossTreeRefRow): CrossTreeRef {
  return {
    fromTreeId: row.from_tree_id,
    fromNodeId: row.from_node_id,
    toTreeId: row.to_tree_id,
    toNodeId: row.to_node_id,
    kind: row.kind,
    live: row.live,
  };
}

function rowToTagCategory(row: TagCategoryRow): TagCategory {
  return {
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
  };
}

function rowToTag(row: TagRow): Tag {
  return {
    tagId: row.tag_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    createdAt:
      typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
  };
}

export class PostgresRepository implements NodeRepository {
  private sql: postgres.Sql;

  constructor(sql: postgres.Sql) {
    this.sql = sql;
  }

  async migrate(): Promise<void> {
    await runMigrations(this.sql);
  }

  /** Attach contextSources (from cross_tree_refs) to a base tree. */
  private async fillContextSources(tree: Tree): Promise<Tree> {
    const rows = await this.sql<{ to_tree_id: string; to_node_id: string }[]>`
      SELECT to_tree_id, to_node_id FROM cross_tree_refs
      WHERE from_tree_id = ${tree.treeId} AND from_node_id IS NULL
        AND kind = ${CROSS_TREE_REF_KINDS.CONTEXT_SOURCE}
    `;
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
    await this.sql`
      DELETE FROM cross_tree_refs
      WHERE from_tree_id = ${treeId} AND from_node_id IS NULL
        AND kind = ${CROSS_TREE_REF_KINDS.CONTEXT_SOURCE}
    `;
    for (const cs of contextSources ?? []) {
      await this.sql`
        INSERT INTO cross_tree_refs (from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live)
        VALUES (${treeId}, NULL, ${cs.treeId}, ${cs.nodeId}, ${CROSS_TREE_REF_KINDS.CONTEXT_SOURCE}, TRUE)
      `;
    }
  }

  async getTree(treeId: string): Promise<Tree> {
    const rows = await this.sql<TreeRow[]>`
      SELECT tree_id, title, created_at, root_node_id, context_sources
      FROM trees
      WHERE tree_id = ${treeId}
    `;
    if (rows.length === 0) {
      throw new Error(`Tree not found: ${treeId}`);
    }
    return this.fillContextSources(rowToTree(rows[0]));
  }

  async listTrees(): Promise<Tree[]> {
    const rows = await this.sql<TreeRow[]>`
      SELECT tree_id, title, created_at, root_node_id, context_sources
      FROM trees
    `;
    return Promise.all(rows.map((row) => this.fillContextSources(rowToTree(row))));
  }

  async putTree(tree: Tree): Promise<void> {
    // The legacy context_sources column is left NULL; contextSources live in
    // the unified cross_tree_refs table.
    await this.sql`
      INSERT INTO trees (tree_id, title, created_at, root_node_id, context_sources)
      VALUES (${tree.treeId}, ${tree.title}, ${tree.createdAt}, ${tree.rootNodeId}, NULL)
      ON CONFLICT (tree_id) DO UPDATE SET
        title = EXCLUDED.title,
        created_at = EXCLUDED.created_at,
        root_node_id = EXCLUDED.root_node_id
    `;
    await this.syncContextSources(tree.treeId, tree.contextSources);
  }

  async getNode(nodeId: string): Promise<Node> {
    const rows = await this.sql<NodeRow[]>`
      SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
             n.content, n.is_deleted, n.created_at, n.model_name,
             n.provider, n.token_count, n.embedding_model,
             n.metadata, n.author, bi.name AS intent
      FROM nodes n
      JOIN node_types nt ON nt.id = n.node_type_id
      LEFT JOIN branch_intents bi ON bi.id = n.intent_id
      WHERE n.node_id = ${nodeId}
    `;
    if (rows.length === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    return rowToNode(rows[0]);
  }

  async getNodes(treeId: string): Promise<Node[]> {
    const rows = await this.sql<NodeRow[]>`
      SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
             n.content, n.is_deleted, n.created_at, n.model_name,
             n.provider, n.token_count, n.embedding_model,
             n.metadata, n.author, bi.name AS intent
      FROM nodes n
      JOIN node_types nt ON nt.id = n.node_type_id
      LEFT JOIN branch_intents bi ON bi.id = n.intent_id
      WHERE n.tree_id = ${treeId}
    `;
    return rows.map(rowToNode);
  }

  async putNode(node: Node): Promise<void> {
    const metadataJson = node.metadata ? JSON.stringify(node.metadata) : null;
    await this.sql`
      INSERT INTO nodes (node_id, tree_id, parent_id, node_type_id, content, is_deleted,
                         created_at, model_name, provider, token_count, embedding_model,
                         metadata, author, intent_id)
      VALUES (${node.nodeId}, ${node.treeId}, ${node.parentId},
              (SELECT id FROM node_types WHERE name = ${node.type}),
              ${node.content}, ${node.isDeleted}, ${node.createdAt},
              ${node.modelName}, ${node.provider}, ${node.tokenCount},
              ${node.embeddingModel}, ${metadataJson}::jsonb, ${node.author},
              (SELECT id FROM branch_intents WHERE name = ${node.intent}))
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
        embedding_model = EXCLUDED.embedding_model,
        metadata = EXCLUDED.metadata,
        author = EXCLUDED.author,
        intent_id = EXCLUDED.intent_id
    `;
  }

  async softDeleteNode(nodeId: string): Promise<void> {
    const result = await this.sql`
      UPDATE nodes SET is_deleted = TRUE WHERE node_id = ${nodeId}
    `;
    if (result.count === 0) {
      throw new Error(`Node not found: ${nodeId}`);
    }
  }

  async deleteTree(treeId: string): Promise<void> {
    await this.sql`DELETE FROM cross_tree_refs WHERE from_tree_id = ${treeId}`;
    await this.sql`DELETE FROM nodes WHERE tree_id = ${treeId}`;
    const result = await this.sql`DELETE FROM trees WHERE tree_id = ${treeId}`;
    if (result.count === 0) {
      throw new Error(`Tree not found: ${treeId}`);
    }
  }

  async updateNodeEmbedding(nodeId: string, embedding: number[], model: string): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.sql`
      UPDATE nodes
      SET embedding = ${vectorStr}::vector,
          embedding_model = ${model}
      WHERE node_id = ${nodeId}
    `;
  }

  async semanticSearch(options: SemanticSearchOptions): Promise<SemanticSearchResult[]> {
    const vectorStr = `[${options.embedding.join(',')}]`;
    const limit = options.limit ?? 10;
    const rows = await this.sql<(NodeRow & { score: number })[]>`
      SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
             n.content, n.is_deleted, n.created_at, n.model_name,
             n.provider, n.token_count, n.embedding_model,
             n.metadata, n.author, bi.name AS intent,
             1 - (n.embedding <=> ${vectorStr}::vector) AS score
      FROM nodes n
      JOIN node_types nt ON nt.id = n.node_type_id
      LEFT JOIN branch_intents bi ON bi.id = n.intent_id
      WHERE n.tree_id = ${options.treeId}
        AND n.is_deleted = FALSE
        AND n.embedding IS NOT NULL
      ORDER BY n.embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `;
    return rows.map((row) => ({ node: rowToNode(row), score: row.score }));
  }

  async searchNodes(options: SearchOptions): Promise<SearchResult[]> {
    const pattern = `%${options.query}%`;
    const includeDeleted = options.includeDeleted ?? false;
    const nodeTypes = options.nodeTypes ?? [];
    const treeId = options.treeId ?? null;

    const rows = await this.sql<(NodeRow & { tree_title: string })[]>`
      SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
             n.content, n.is_deleted, n.created_at, n.model_name,
             n.provider, n.token_count, n.embedding_model,
             n.metadata, n.author, bi.name AS intent, t.title AS tree_title
      FROM nodes n
      JOIN node_types nt ON nt.id = n.node_type_id
      LEFT JOIN branch_intents bi ON bi.id = n.intent_id
      JOIN trees t ON t.tree_id = n.tree_id
      WHERE n.content ILIKE ${pattern}
        AND (${includeDeleted} OR n.is_deleted = FALSE)
        AND (${treeId} IS NULL OR n.tree_id = ${treeId})
        AND (${nodeTypes.length === 0} OR nt.name = ANY(${nodeTypes}))
      ORDER BY n.created_at DESC
    `;
    return rows.map((row) => ({ node: rowToNode(row), treeTitle: row.tree_title }));
  }

  async searchTrees(query: string): Promise<Tree[]> {
    const pattern = `%${query}%`;
    const rows = await this.sql<TreeRow[]>`
      SELECT tree_id, title, created_at, root_node_id, context_sources
      FROM trees
      WHERE title ILIKE ${pattern}
      ORDER BY created_at DESC
    `;
    return Promise.all(rows.map((row) => this.fillContextSources(rowToTree(row))));
  }

  // ── Tag category CRUD ──

  async createCategory(category: TagCategory): Promise<void> {
    await this.sql`
      INSERT INTO tag_categories (category_id, name, description, created_at)
      VALUES (${category.categoryId}, ${category.name}, ${category.description}, ${category.createdAt})
    `;
  }

  async getCategory(categoryId: string): Promise<TagCategory> {
    const rows = await this.sql<TagCategoryRow[]>`
      SELECT category_id, name, description, created_at
      FROM tag_categories
      WHERE category_id = ${categoryId}
    `;
    if (rows.length === 0) {
      throw new Error(`TagCategory not found: ${categoryId}`);
    }
    return rowToTagCategory(rows[0]);
  }

  async listCategories(): Promise<TagCategory[]> {
    const rows = await this.sql<TagCategoryRow[]>`
      SELECT category_id, name, description, created_at
      FROM tag_categories
      ORDER BY name
    `;
    return rows.map(rowToTagCategory);
  }

  async updateCategory(
    categoryId: string,
    fields: { name?: string; description?: string },
  ): Promise<void> {
    const current = await this.getCategory(categoryId);
    const newName = fields.name ?? current.name;
    const newDescription = fields.description ?? current.description;
    await this.sql`
      UPDATE tag_categories
      SET name = ${newName}, description = ${newDescription}
      WHERE category_id = ${categoryId}
    `;
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const tags = await this.sql<TagRow[]>`
      SELECT tag_id FROM tags WHERE category_id = ${categoryId}
    `;
    if (tags.length > 0) {
      throw new Error(`Cannot delete category ${categoryId}: it still has ${tags.length} tag(s)`);
    }
    const result = await this.sql`
      DELETE FROM tag_categories WHERE category_id = ${categoryId}
    `;
    if (result.count === 0) {
      throw new Error(`TagCategory not found: ${categoryId}`);
    }
  }

  // ── Tag CRUD ──

  async createTag(tag: Tag): Promise<void> {
    await this.sql`
      INSERT INTO tags (tag_id, category_id, name, description, created_at)
      VALUES (${tag.tagId}, ${tag.categoryId}, ${tag.name}, ${tag.description}, ${tag.createdAt})
    `;
  }

  async getTag(tagId: string): Promise<Tag> {
    const rows = await this.sql<TagRow[]>`
      SELECT tag_id, category_id, name, description, created_at
      FROM tags
      WHERE tag_id = ${tagId}
    `;
    if (rows.length === 0) {
      throw new Error(`Tag not found: ${tagId}`);
    }
    return rowToTag(rows[0]);
  }

  async listTags(categoryId?: string): Promise<Tag[]> {
    const rows = await this.sql<TagRow[]>`
      SELECT tag_id, category_id, name, description, created_at
      FROM tags
      WHERE (${categoryId ?? null} IS NULL OR category_id = ${categoryId ?? null})
      ORDER BY name
    `;
    return rows.map(rowToTag);
  }

  async updateTag(tagId: string, fields: { name?: string; description?: string }): Promise<void> {
    const current = await this.getTag(tagId);
    const newName = fields.name ?? current.name;
    const newDescription = fields.description ?? current.description;
    await this.sql`
      UPDATE tags
      SET name = ${newName}, description = ${newDescription}
      WHERE tag_id = ${tagId}
    `;
  }

  async deleteTag(tagId: string): Promise<void> {
    const result = await this.sql`
      DELETE FROM tags WHERE tag_id = ${tagId}
    `;
    if (result.count === 0) {
      throw new Error(`Tag not found: ${tagId}`);
    }
  }

  // ── Tagging operations ──

  async tagNode(nodeId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    const values = tagIds.map((tagId) => ({ node_id: nodeId, tag_id: tagId }));
    await this.sql`
      INSERT INTO node_tags ${this.sql(values)}
      ON CONFLICT DO NOTHING
    `;
  }

  async untagNode(nodeId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    await this.sql`
      DELETE FROM node_tags
      WHERE node_id = ${nodeId} AND tag_id = ANY(${tagIds})
    `;
  }

  async getNodeTags(nodeId: string): Promise<Tag[]> {
    const rows = await this.sql<TagRow[]>`
      SELECT t.tag_id, t.category_id, t.name, t.description, t.created_at
      FROM tags t
      JOIN node_tags nt ON nt.tag_id = t.tag_id
      WHERE nt.node_id = ${nodeId}
      ORDER BY t.name
    `;
    return rows.map(rowToTag);
  }

  async tagTree(treeId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    const values = tagIds.map((tagId) => ({ tree_id: treeId, tag_id: tagId }));
    await this.sql`
      INSERT INTO tree_tags ${this.sql(values)}
      ON CONFLICT DO NOTHING
    `;
  }

  async untagTree(treeId: string, tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) return;
    await this.sql`
      DELETE FROM tree_tags
      WHERE tree_id = ${treeId} AND tag_id = ANY(${tagIds})
    `;
  }

  async getTreeTags(treeId: string): Promise<Tag[]> {
    const rows = await this.sql<TagRow[]>`
      SELECT t.tag_id, t.category_id, t.name, t.description, t.created_at
      FROM tags t
      JOIN tree_tags tt ON tt.tag_id = t.tag_id
      WHERE tt.tree_id = ${treeId}
      ORDER BY t.name
    `;
    return rows.map(rowToTag);
  }

  // ── Tag-based queries ──

  async findNodesByTags(
    tagIds: string[],
    options?: { treeId?: string; matchAll?: boolean },
  ): Promise<Node[]> {
    if (tagIds.length === 0) return [];
    const treeId = options?.treeId ?? null;
    const matchAll = options?.matchAll ?? true;
    const requiredCount = matchAll ? tagIds.length : 0;
    const rows = await this.sql<NodeRow[]>`
      SELECT n.node_id, n.tree_id, n.parent_id, nt.name AS type_name,
             n.content, n.is_deleted, n.created_at, n.model_name,
             n.provider, n.token_count, n.embedding_model,
             n.metadata, n.author, bi.name AS intent
      FROM nodes n
      JOIN node_types nt ON nt.id = n.node_type_id
      LEFT JOIN branch_intents bi ON bi.id = n.intent_id
      JOIN node_tags ntg ON ntg.node_id = n.node_id
      WHERE ntg.tag_id = ANY(${tagIds})
        AND (${treeId} IS NULL OR n.tree_id = ${treeId})
      GROUP BY n.node_id, n.tree_id, n.parent_id, nt.name,
               n.content, n.is_deleted, n.created_at, n.model_name,
               n.provider, n.token_count, n.embedding_model,
               n.metadata, n.author, bi.name
      HAVING COUNT(DISTINCT ntg.tag_id) >= ${matchAll ? requiredCount : 1}
    `;
    return rows.map(rowToNode);
  }

  async findTreesByTags(tagIds: string[], options?: { matchAll?: boolean }): Promise<Tree[]> {
    if (tagIds.length === 0) return [];
    const matchAll = options?.matchAll ?? true;
    const requiredCount = matchAll ? tagIds.length : 1;
    const rows = await this.sql<TreeRow[]>`
      SELECT t.tree_id, t.title, t.created_at, t.root_node_id, t.context_sources
      FROM trees t
      JOIN tree_tags tt ON tt.tree_id = t.tree_id
      WHERE tt.tag_id = ANY(${tagIds})
      GROUP BY t.tree_id, t.title, t.created_at, t.root_node_id, t.context_sources
      HAVING COUNT(DISTINCT tt.tag_id) >= ${requiredCount}
    `;
    return Promise.all(rows.map((row) => this.fillContextSources(rowToTree(row))));
  }

  // ── Cross-tree references ──────────────────────────────────────────────

  async putCrossTreeRef(ref: CrossTreeRef): Promise<void> {
    await this.sql`
      DELETE FROM cross_tree_refs
      WHERE from_tree_id = ${ref.fromTreeId}
        AND from_node_id IS NOT DISTINCT FROM ${ref.fromNodeId}
        AND to_tree_id = ${ref.toTreeId} AND to_node_id = ${ref.toNodeId} AND kind = ${ref.kind}
    `;
    await this.sql`
      INSERT INTO cross_tree_refs (from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live)
      VALUES (${ref.fromTreeId}, ${ref.fromNodeId}, ${ref.toTreeId}, ${ref.toNodeId}, ${ref.kind}, ${ref.live})
    `;
  }

  async getCrossTreeRefs(query?: CrossTreeRefQuery): Promise<CrossTreeRef[]> {
    const rows = await this.sql<CrossTreeRefRow[]>`
      SELECT from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live
      FROM cross_tree_refs
      ${this.refWhere(query)}
    `;
    return rows.map(rowToCrossTreeRef);
  }

  async deleteCrossTreeRefs(query: CrossTreeRefQuery): Promise<number> {
    const result = await this.sql`
      DELETE FROM cross_tree_refs
      ${this.refWhere(query)}
    `;
    return result.count;
  }

  /** Build a WHERE fragment for a cross-tree-ref query (empty = match all). */
  private refWhere(query?: CrossTreeRefQuery): postgres.Fragment {
    const conditions: postgres.Fragment[] = [];
    if (query?.fromTreeId !== undefined) {
      conditions.push(this.sql`from_tree_id = ${query.fromTreeId}`);
    }
    if (query?.fromNodeId !== undefined) {
      conditions.push(this.sql`from_node_id IS NOT DISTINCT FROM ${query.fromNodeId}`);
    }
    if (query?.toTreeId !== undefined) {
      conditions.push(this.sql`to_tree_id = ${query.toTreeId}`);
    }
    if (query?.toNodeId !== undefined) {
      conditions.push(this.sql`to_node_id = ${query.toNodeId}`);
    }
    if (query?.kind !== undefined) {
      conditions.push(this.sql`kind = ${query.kind}`);
    }
    if (conditions.length === 0) return this.sql``;
    let where = this.sql`WHERE ${conditions[0]}`;
    for (let i = 1; i < conditions.length; i++) {
      where = this.sql`${where} AND ${conditions[i]}`;
    }
    return where;
  }
}
