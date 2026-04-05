# Lineage

A modular platform for building AI-powered applications with full lineage tracking.

## Architecture

```
lineage/
  packages/
    core/               # Zero-dependency domain model and interfaces
    adapters/
      sqlite/           # better-sqlite3 (server) + sql.js (browser)
      tauri-sqlite/     # @tauri-apps/plugin-sql (desktop)
      postgres/         # postgres.js + pgvector
      anthropic/        # @anthropic-ai/sdk
      openai/           # openai
      bedrock/          # @aws-sdk/client-bedrock-runtime
      ollama/           # fetch only, no SDK
    sdk/                # @lineage/sdk — typed REST client
  apps/
    server/             # Hono API server
    web/                # React frontend (Vite)
    desktop/            # Tauri desktop app
    cli/                # Export/import CLI
```

## Local Setup

### Prerequisites

- Node.js 22+ (`nvm use`)
- pnpm 10+ (`corepack enable`)
- Rust toolchain (for desktop app only — `rustup` at https://rustup.rs)
- Ollama (for LLM features — https://ollama.com)

### Install & Build

```bash
pnpm install
pnpm build
pnpm test
```

## Running

### Server

The API server provides REST endpoints for tree/node CRUD and LLM streaming (completions, summarization, title generation). It uses SQLite for storage and Ollama for LLM by default.

```bash
# Development (auto-reload)
pnpm --filter @lineage/server dev

# Or from the server directory
cd apps/server && pnpm dev
```

The server starts on `http://localhost:3000`. Configure via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `STORAGE_PATH` | `./lineage.db` | SQLite database path |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API URL |
| `OLLAMA_MODEL` | `llama3.2` | Default LLM model |

### Web App

The React frontend connects to the server for data and LLM features. It also supports a local-only mode using sql.js (SQLite in the browser via IndexedDB).

```bash
# Start the dev server
pnpm --filter @lineage/web dev
```

Opens at `http://localhost:5173`. To use with a running server, set `lineage:serverUrl` to `http://localhost:3000` in the app's Settings page. For local-only mode (no server required, no LLM), set the storage mode to "local" in Settings.

### Desktop App (Tauri)

The desktop app wraps the web frontend in a native window and bundles its own server sidecar so everything runs locally with no separate server process needed.

```bash
# Development (hot-reload frontend + Rust rebuild on change)
pnpm desktop:dev

# Production build (.app + .dmg on macOS)
pnpm --filter @lineage/desktop tauri:build
```

The built app is at:
- `apps/desktop/src-tauri/target/release/bundle/macos/Lineage.app`
- `apps/desktop/src-tauri/target/release/bundle/dmg/Lineage_0.0.0_aarch64.dmg`

The desktop app requires Node.js on the host machine (the bundled server sidecar runs via `node`). The sidecar listens on port 3210 and stores its database in the system app data directory (`~/Library/Application Support/com.lineage.desktop/lineage.db` on macOS).

## Available Commands

| Command | Description |
|---|---|
| `pnpm build` | Build all packages and apps |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages |
| `pnpm format` | Format all files with Prettier |
| `pnpm format:check` | Check formatting without modifying |
| `pnpm desktop:dev` | Run the desktop app in development mode |
| `pnpm --filter @lineage/desktop tauri:build` | Build the desktop app for distribution |

## Turborepo Remote Caching

To enable remote caching for faster CI builds:

```bash
npx turbo login
npx turbo link
```

See [Turborepo Remote Caching docs](https://turbo.build/repo/docs/core-concepts/remote-caching) for more details.

## Project Tracking

[Linear Initiative](https://linear.app/thought-tree)
