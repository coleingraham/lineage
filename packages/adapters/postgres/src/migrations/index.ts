import type postgres from 'postgres';

const INIT_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS node_types (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

INSERT INTO node_types (name) VALUES ('human'), ('ai'), ('summary') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS trees (
  tree_id      UUID PRIMARY KEY,
  title        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  root_node_id UUID NOT NULL
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
  embedding       vector(1536)
);

CREATE INDEX IF NOT EXISTS nodes_embedding_idx ON nodes USING hnsw (embedding vector_cosine_ops);
`;

export async function runMigrations(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(INIT_SQL);
}
