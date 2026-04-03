# Lineage

A modular platform for building AI-powered applications with full lineage tracking.

## Architecture

```
lineage/
  packages/
    core/               # Zero-dependency domain model and interfaces
    adapters/
      sqlite/           # better-sqlite3 (server) + wa-sqlite (browser)
      postgres/         # postgres.js + pgvector
      anthropic/        # @anthropic-ai/sdk
      openai/           # openai
      bedrock/          # @aws-sdk/client-bedrock-runtime
      ollama/           # fetch only, no SDK
    sdk/                # @lineage/sdk — typed REST client
  apps/
    server/             # Hono API server
    web/                # React frontend (Vite)
    desktop/            # Tauri shell
    cli/                # Export/import CLI
  deploy/
    docker/
    terraform/
```

## Local Setup

### Prerequisites

- Node.js 22 (`nvm use`)
- pnpm 10 (`corepack enable`)

### Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm turbo build

# Run all tests
pnpm turbo test

# Type check
pnpm turbo typecheck

# Lint
pnpm turbo lint

# Format
pnpm format
```

## Available Commands

| Command                | Description                        |
| ---------------------- | ---------------------------------- |
| `pnpm turbo build`     | Build all packages and apps        |
| `pnpm turbo test`      | Run all tests                      |
| `pnpm turbo typecheck` | Type check all packages            |
| `pnpm turbo lint`      | Lint all packages                  |
| `pnpm format`          | Format all files with Prettier     |
| `pnpm format:check`    | Check formatting without modifying |

## Turborepo Remote Caching

To enable remote caching for faster CI builds:

```bash
npx turbo login
npx turbo link
```

See [Turborepo Remote Caching docs](https://turbo.build/repo/docs/core-concepts/remote-caching) for more details.

## Project Tracking

[Linear Initiative](https://linear.app/thought-tree)
