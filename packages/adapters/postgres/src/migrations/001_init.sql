CREATE EXTENSION IF NOT EXISTS vector;

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
  type            TEXT NOT NULL CHECK (type IN ('human', 'ai', 'summary')),
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
