import type Database from 'better-sqlite3';

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

const MIGRATE_V5 = `
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

const MIGRATE_V6 = `
CREATE TABLE IF NOT EXISTS branch_intents (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
INSERT OR IGNORE INTO branch_intents (id, name) VALUES
  (1, 'sequence'), (2, 'alternative'), (3, 'elaboration'), (4, 'objection');
ALTER TABLE nodes ADD COLUMN intent_id INTEGER REFERENCES branch_intents(id);
`;

export function runMigrations(db: Database.Database): void {
  db.exec(INIT_SQL);

  // V2: add metadata, author columns and new node types (safe on existing DBs)
  const hasMetadata = db
    .prepare("SELECT COUNT(*) AS cnt FROM pragma_table_info('nodes') WHERE name = 'metadata'")
    .get() as { cnt: number };
  if (hasMetadata.cnt === 0) {
    db.exec(MIGRATE_V2);
  }

  // V3: add context_sources column to trees
  const hasContextSources = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM pragma_table_info('trees') WHERE name = 'context_sources'",
    )
    .get() as { cnt: number };
  if (hasContextSources.cnt === 0) {
    db.exec(MIGRATE_V3);
  }

  // V4: add tagging tables (tag_categories, tags, node_tags, tree_tags)
  const hasTagCategories = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name = 'tag_categories'",
    )
    .get() as { cnt: number };
  if (hasTagCategories.cnt === 0) {
    db.exec(MIGRATE_V4);
  }

  // V5: unified cross_tree_refs table; backfill from trees.context_sources.
  const hasCrossTreeRefs = db
    .prepare(
      "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name = 'cross_tree_refs'",
    )
    .get() as { cnt: number };
  if (hasCrossTreeRefs.cnt === 0) {
    db.exec(MIGRATE_V5);
    backfillCrossTreeRefs(db);
  }

  // V6: branch_intents lookup table + nodes.intent_id column (labels the hard
  // edge from a node to its parent).
  const hasIntentId = db
    .prepare("SELECT COUNT(*) AS cnt FROM pragma_table_info('nodes') WHERE name = 'intent_id'")
    .get() as { cnt: number };
  if (hasIntentId.cnt === 0) {
    db.exec(MIGRATE_V6);
  }
}

/**
 * Backfill the unified cross_tree_refs table from the legacy
 * trees.context_sources JSON column. Each entry becomes a tree-owned
 * (from_node_id = NULL) `context_source` ref. Behavior-preserving: the column
 * is left in place but is no longer read by the repository.
 */
function backfillCrossTreeRefs(db: Database.Database): void {
  const rows = db
    .prepare<
      [],
      { tree_id: string; context_sources: string | null }
    >('SELECT tree_id, context_sources FROM trees WHERE context_sources IS NOT NULL')
    .all();
  const insert = db.prepare(
    `INSERT INTO cross_tree_refs (from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live)
     VALUES (?, NULL, ?, ?, 'context_source', 1)`,
  );
  const insertMany = db.transaction((items: typeof rows) => {
    for (const row of items) {
      if (!row.context_sources) continue;
      let sources: { treeId: string; nodeId: string }[];
      try {
        sources = JSON.parse(row.context_sources) as { treeId: string; nodeId: string }[];
      } catch {
        continue;
      }
      for (const cs of sources) {
        insert.run(row.tree_id, cs.treeId, cs.nodeId);
      }
    }
  });
  insertMany(rows);
}
