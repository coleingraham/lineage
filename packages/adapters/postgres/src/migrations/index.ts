import type postgres from 'postgres';

const INIT_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS node_types (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT INTO node_types (name) VALUES ('human'), ('ai'), ('summary'), ('system'), ('tool_call'), ('tool_result') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS trees (
  tree_id          UUID PRIMARY KEY,
  title            TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  root_node_id     UUID NOT NULL,
  context_sources  JSONB
);

CREATE TABLE IF NOT EXISTS nodes (
  node_id         UUID PRIMARY KEY,
  tree_id         UUID NOT NULL REFERENCES trees(tree_id),
  parent_id       UUID REFERENCES nodes(node_id),
  node_type_id    INTEGER NOT NULL REFERENCES node_types(id),
  content         TEXT NOT NULL,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_name      TEXT,
  provider        TEXT,
  token_count     INTEGER,
  embedding_model TEXT,
  embedding       vector(1536),
  metadata        JSONB,
  author          TEXT
);

CREATE INDEX IF NOT EXISTS nodes_embedding_idx ON nodes USING hnsw (embedding vector_cosine_ops);
`;

const MIGRATE_V2 = `
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS author TEXT;
INSERT INTO node_types (name) VALUES ('system'), ('tool_call'), ('tool_result') ON CONFLICT DO NOTHING;
`;

const MIGRATE_V3 = `
ALTER TABLE trees ADD COLUMN IF NOT EXISTS context_sources JSONB;
`;

const MIGRATE_V4 = `
CREATE TABLE IF NOT EXISTS tag_categories (
  category_id  UUID PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tags (
  tag_id       UUID PRIMARY KEY,
  category_id  UUID NOT NULL REFERENCES tag_categories(category_id),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, name)
);
CREATE TABLE IF NOT EXISTS node_tags (
  node_id  UUID NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
  tag_id   UUID NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, tag_id)
);
CREATE TABLE IF NOT EXISTS tree_tags (
  tree_id  UUID NOT NULL REFERENCES trees(tree_id) ON DELETE CASCADE,
  tag_id   UUID NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
  PRIMARY KEY (tree_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category_id);
CREATE INDEX IF NOT EXISTS idx_node_tags_tag ON node_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tree_tags_tag ON tree_tags(tag_id);
`;

const MIGRATE_V5 = `
CREATE TABLE IF NOT EXISTS cross_tree_refs (
  from_tree_id  UUID NOT NULL,
  from_node_id  UUID,
  to_tree_id    UUID NOT NULL,
  to_node_id    UUID NOT NULL,
  kind          TEXT NOT NULL,
  live          BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_ctr_from ON cross_tree_refs(from_tree_id, from_node_id);
CREATE INDEX IF NOT EXISTS idx_ctr_to ON cross_tree_refs(to_tree_id, to_node_id);
CREATE INDEX IF NOT EXISTS idx_ctr_kind ON cross_tree_refs(kind);
`;

// Backfill tree-owned context_source refs from the legacy column. Idempotent:
// only trees without existing context_source refs are processed.
const MIGRATE_V5_BACKFILL = `
INSERT INTO cross_tree_refs (from_tree_id, from_node_id, to_tree_id, to_node_id, kind, live)
SELECT t.tree_id, NULL, (elem->>'treeId')::uuid, (elem->>'nodeId')::uuid, 'context_source', TRUE
FROM trees t
CROSS JOIN LATERAL jsonb_array_elements(t.context_sources) AS elem
WHERE t.context_sources IS NOT NULL
  AND jsonb_typeof(t.context_sources) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM cross_tree_refs c
    WHERE c.from_tree_id = t.tree_id AND c.from_node_id IS NULL AND c.kind = 'context_source'
  );
`;

export async function runMigrations(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(INIT_SQL);
  await sql.unsafe(MIGRATE_V2);
  await sql.unsafe(MIGRATE_V3);
  await sql.unsafe(MIGRATE_V4);
  await sql.unsafe(MIGRATE_V5);
  await sql.unsafe(MIGRATE_V5_BACKFILL);
}
