# @lineage/mcp

MCP (Model Context Protocol) server for Lineage. Exposes conversation history, context building, and agent workflow tools to any MCP client.

## Quick start

```bash
# SQLite (default)
pnpm --filter @lineage/mcp start

# Custom database path
pnpm --filter @lineage/mcp start -- --db ./my-data.db

# Full config with LLM (enables auto-summarization)
pnpm --filter @lineage/mcp start -- --config ./lineage.config.json
```

### Config file example

```json
{
  "storage": {
    "backend": "sqlite",
    "path": "./lineage.db"
  },
  "llm": {
    "provider": "ollama",
    "model": "llama3.2",
    "baseUrl": "http://localhost:11434"
  },
  "embedding": {
    "enabled": false
  }
}
```

Supported LLM providers: `ollama`, `openai`, `anthropic`, `bedrock`. When configured, `end_session` and `create_tree_from_nodes` auto-generate summaries instead of using truncated recaps.

## Tools

### CRUD

| Tool          | Description                                                                  |
| ------------- | ---------------------------------------------------------------------------- |
| `list_trees`  | List all trees (supports `limit`/`offset`)                                   |
| `get_tree`    | Get tree by ID                                                               |
| `create_tree` | Create tree with optional `contextSources`                                   |
| `update_tree` | Update title and/or `contextSources`                                         |
| `delete_tree` | Delete tree and all nodes                                                    |
| `list_nodes`  | List nodes in a tree (supports type filter, `limit`/`offset`)                |
| `get_node`    | Get node by ID                                                               |
| `create_node` | Create node with `metadata`, `modelName`, `provider`, `tokenCount`, `author` |
| `update_node` | Update node content                                                          |
| `delete_node` | Soft-delete a node                                                           |

### Navigation

| Tool               | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| `get_path_to_root` | Full ancestry path from a node to root                                         |
| `get_children`     | Direct children of a node                                                      |
| `get_siblings`     | Sibling nodes (same parent)                                                    |
| `get_leaf_nodes`   | Tip node of each branch                                                        |
| `build_context`    | Token-budgeted message context from node to root (respects summary boundaries) |

### Search

| Tool     | Description                                |
| -------- | ------------------------------------------ |
| `search` | Full-text search across titles and content |

### Tags & categories

| Tool              | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `create_category` | Create a tag category for organizing tags             |
| `list_categories` | List all tag categories                               |
| `update_category` | Update a category name and/or description             |
| `delete_category` | Delete an empty category (fails if it still has tags) |
| `create_tag`      | Create a tag within a category                        |
| `list_tags`       | List tags, optionally filtered by category            |
| `update_tag`      | Update a tag name and/or description                  |
| `delete_tag`      | Delete a tag and remove all associations              |
| `tag_node`        | Apply tags to a node by tag IDs                       |
| `untag_node`      | Remove tags from a node by tag IDs                    |
| `get_node_tags`   | Get all tags on a node                                |
| `tag_tree`        | Apply tags to a tree by tag IDs                       |
| `untag_tree`      | Remove tags from a tree by tag IDs                    |
| `get_tree_tags`   | Get all tags on a tree                                |
| `find_by_tags`    | Find nodes/trees with ALL given tags (intersection)   |

### Agent workflow

| Tool                     | Description                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `record_decision`        | Capture a decision with tag IDs, reasoning, and file references    |
| `recall_context`         | Search + context assembly in one call (supports tag filtering)     |
| `start_session`          | Start a session, optionally seeded with context from related trees |
| `end_session`            | End a session with summary (auto-generated if LLM configured)      |
| `create_tree_from_nodes` | Build a new tree from curated nodes across multiple trees          |

## Using with Claude Code

### MCP server configuration

Add to your Claude Code MCP settings (`.claude/settings.json` or project-level):

```json
{
  "mcpServers": {
    "lineage": {
      "command": "node",
      "args": ["./packages/mcp/dist/index.js", "--config", "./lineage.config.json"]
    }
  }
}
```

Or without LLM (SQLite only):

```json
{
  "mcpServers": {
    "lineage": {
      "command": "node",
      "args": ["./packages/mcp/dist/index.js", "--db", "./lineage.db"]
    }
  }
}
```

### Hooks integration

Claude Code supports hooks that run shell commands in response to session events. You can use hooks to automatically start and end Lineage sessions without the agent needing to remember to do it.

#### Session-start hook

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ./scripts/lineage-session-start.js"
          }
        ]
      }
    ]
  }
}
```

Example `scripts/lineage-session-start.js`:

```javascript
#!/usr/bin/env node
// Called automatically when a Claude Code session starts.
// Creates a Lineage session and writes the tree/root IDs to a temp file
// so the agent (or a CLAUDE.md instruction) can reference them.
import Database from 'better-sqlite3';
import { SqliteRepository } from '@lineage/adapter-sqlite';
import { createNode } from '@lineage/core';
import { writeFileSync } from 'node:fs';

const db = new Database('./lineage.db');
const repo = new SqliteRepository(db);

const treeId = crypto.randomUUID();
const rootNodeId = crypto.randomUUID();
const createdAt = new Date().toISOString();

await repo.putTree({
  treeId,
  title: 'Untitled session',
  createdAt,
  rootNodeId,
  contextSources: null,
});

await repo.putNode(
  createNode({
    nodeId: rootNodeId,
    treeId,
    parentId: null,
    type: 'human',
    content: '',
    metadata: { sessionType: 'coding', startedAt: createdAt },
  }),
);

// Write session info so the agent can find it
writeFileSync('/tmp/lineage-session.json', JSON.stringify({ treeId, rootNodeId }));
console.log(`Lineage session started: ${treeId}`);
```

#### CLAUDE.md instructions

Add to your project's `CLAUDE.md` to guide the agent on when to record decisions:

```markdown
## Lineage memory

This project uses Lineage for cross-session memory. The MCP server `lineage` is available.

- At key decision points (architectural choices, trade-off resolutions, "why not X" moments),
  use `record_decision` with descriptive tags and reasoning.
- When starting work on a topic you've worked on before, use `recall_context` to check
  for relevant prior decisions.
- The session ID is in `/tmp/lineage-session.json` if you need it for `record_decision`.
```

#### Setting up tags

Create categories and tags once, then reuse them across sessions:

```
create_category({ name: "architecture", description: "Architectural decisions" })
create_category({ name: "status", description: "Decision status" })

create_tag({ categoryId: "<arch-id>", name: "database", description: "Database choices" })
create_tag({ categoryId: "<arch-id>", name: "api-design", description: "API design decisions" })
create_tag({ categoryId: "<status-id>", name: "decided", description: "Final decision made" })
create_tag({ categoryId: "<status-id>", name: "revisited", description: "Decision was reconsidered" })
```

Then use tag IDs with `record_decision`:

```
record_decision({
  treeId: "...", parentId: "...",
  summary: "Chose PostgreSQL for production storage",
  reasoning: "Need concurrent writes and vector search",
  tagIds: ["<database-tag-id>", "<decided-tag-id>"],
  files: ["packages/adapters/postgres/src/repository.ts"]
})
```

Later, find all database decisions: `find_by_tags({ tagIds: ["<database-tag-id>"] })`

#### Tips for effective use

1. **Don't record everything** — only decisions that would be useful to recall later. "Chose X because Y" is valuable; "ran the tests" is not.
2. **Use tags by ID** — call `list_tags` to find existing tags before recording. Tags require IDs, not freeform text, so the taxonomy stays consistent.
3. **Use `create_tree_from_nodes`** when starting a new phase of work — curate the most relevant decisions from past sessions into a focused context tree.
4. **Let `end_session` auto-summarize** if you have an LLM configured — this creates summary nodes that act as context boundaries, keeping future recall focused.
5. **Use `find_by_tags`** to retrieve all decisions matching a tag — more reliable than text search for structured recall.
