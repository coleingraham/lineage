import type Database from 'better-sqlite3';

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
}
