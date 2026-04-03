CREATE TABLE IF NOT EXISTS trees (
  tree_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  root_node_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  node_id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES trees(tree_id),
  parent_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('human', 'ai', 'summary')),
  content TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  model_name TEXT,
  provider TEXT,
  token_count INTEGER,
  embedding_model TEXT
);
