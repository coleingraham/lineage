# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (turbo)
pnpm test                 # Run all tests (turbo)
pnpm lint                 # Lint all packages (turbo)
pnpm typecheck            # Type-check all packages (turbo)
pnpm format               # Format with Prettier
pnpm format:check         # Check formatting
```

**Single package:** Run commands from a package directory, or use `pnpm --filter @lineage/<name> <script>`.

**Single test file:** `pnpm --filter @lineage/<name> exec vitest run path/to/test.ts`

## Architecture

This is a **pnpm + Turborepo monorepo** called Lineage — a modular platform for AI-powered applications with lineage tracking.

### Dependency graph

```
@lineage/core (zero runtime deps — enforced by CI)
  ├── @lineage/sdk (typed REST client)
  ├── @lineage/adapter-{sqlite,postgres,anthropic,openai,bedrock,ollama}
  └── apps: server (Hono), web (React/Vite), desktop (Tauri), cli
```

All apps depend on `core` + `sdk`. All adapters depend only on `core`.

### Key constraints

- **@lineage/core must have zero runtime dependencies.** CI checks this explicitly. Never add `dependencies` to `packages/core/package.json`.
- All packages use `tsc -b` for building, targeting ES2024 with Node16 module resolution.
- Node 22+ required (see `.nvmrc`).
- Turbo task graph: `build` and `test` depend on `^build` (upstream builds first); `lint` runs independently.

### Adding a storage backend adapter

Each storage backend lives in `packages/adapters/<name>/` and implements `NodeRepository` from `@lineage/core`. Use `@lineage/adapter-sqlite` or `@lineage/adapter-postgres` as a reference.

1. **Implement `NodeRepository`** from `@lineage/core` (`src/repository.ts`):
   - All 8 methods: `getTree`, `listTrees`, `putTree`, `getNode`, `getNodes`, `putNode`, `softDeleteNode`, `updateNodeEmbedding`
   - Constructor takes a database connection/client instance
   - Map between snake_case DB rows and camelCase domain objects (`Node`, `Tree`)
   - Use `INSERT ... ON CONFLICT ... DO UPDATE` for upserts in `putTree`/`putNode`
2. **Migrations** (`src/migrations/index.ts`):
   - Create tables: `node_types` (lookup), `trees`, `nodes`
   - Use lookup/reference tables for enum-like columns — never `ENUM` types or `CHECK ... IN (...)`
   - Export a `runMigrations()` function; sync for SQLite-style, async for network DBs
   - SQLite runs migrations in the constructor; network DBs expose an explicit `migrate()` method called by the factory
3. **Register in `@lineage/core`** (three files):
   - `packages/core/src/config.ts` — add the backend name to `STORAGE_BACKENDS`, extend the `Config['storage']` union with its connection options, and update `parseStorage()` to validate the new variant
   - `packages/core/src/factory.ts` — add a `case` in `createRepository()` that dynamically imports the adapter package and instantiates it (call `migrate()` after construction for async backends)
4. **Tests**: the shared contract test suite in `packages/core/src/__tests__/repository.contract.test.ts` accepts a `RepositoryFixture` with `supportsEmbeddings` and `supportsConcurrentWrites` flags — add a fixture for the new backend so the contract tests cover it automatically.
5. **Package scaffolding** — copy `tsconfig.json`, `eslint.config.mjs`, and `package.json` structure from an existing adapter; add the DB driver as a `dependency` alongside `@lineage/core`.
6. **Verify**: `pnpm install`, then `pnpm build && pnpm test && pnpm lint`.

### Adding an LLM provider adapter

Each LLM provider lives in `packages/adapters/<name>/` and follows the same pattern. Use `@lineage/adapter-anthropic` or `@lineage/adapter-openai` as a reference.

1. **Implement `LLMProvider`** from `@lineage/core` (`src/provider.ts`):
   - `complete(messages, config)` → `Promise<string>` — single response
   - `stream(messages, config)` → `AsyncIterable<string>` — yields text deltas
   - Map core roles (`human`, `ai`, `system`) to the vendor's role names
   - Spread optional config fields (e.g. `temperature`) only when defined
   - Accept `apiKey`, `model`, and optional `baseURL` via an options interface
2. **Export** the provider class and options type from `src/index.ts`.
3. **Add the vendor SDK** as a `dependency` in `package.json` (the only runtime dep besides `@lineage/core`).
4. **Tests** (`src/__tests__/provider.test.ts`): mock the vendor SDK with `vi.mock()`, then test:
   - Role mapping for all three roles
   - Optional parameter inclusion/omission (e.g. `temperature`)
   - Response content extraction (`complete`)
   - Streaming delta iteration and filtering (`stream`)
5. **Package scaffolding** — copy `tsconfig.json`, `eslint.config.mjs`, and `package.json` structure from an existing adapter; update the package name to `@lineage/adapter-<name>`.
6. **Verify**: `pnpm install`, then `pnpm --filter @lineage/adapter-<name> build && pnpm --filter @lineage/adapter-<name> test && pnpm --filter @lineage/adapter-<name> lint`.

### Generated & bundled files — never commit

The following paths are **auto-generated** and listed in `.gitignore`. Never commit them:

- `apps/desktop/src-tauri/gen/` — Tauri auto-generated schemas (regenerated by `tauri dev`/`tauri build`)
- `apps/desktop/src-tauri/server-sidecar/` — esbuild bundle of the server (rebuild with `bash apps/desktop/scripts/bundle-server.sh`)
- `apps/desktop/server-sidecar/serve.cjs` — checked-in copy of the server sidecar bundle; rebuild with the same script when server code changes
- `dist/`, `*.tsbuildinfo`, `.turbo/` — build outputs

When server code changes and you need it reflected in the desktop app, run `bash apps/desktop/scripts/bundle-server.sh` to rebuild the sidecar bundle, then commit the updated `apps/desktop/server-sidecar/serve.cjs`.

### Conventions

- **Commits:** Conventional commits (`feat:`, `fix:`, `chore:`, etc.)
- **Branches:** `type/description` (e.g. `feat/add-search`)
- **Formatting:** Prettier with single quotes, semicolons, trailing commas, 100 char width
- **Linting:** Shared config in `@lineage/eslint-config`, each package imports it via `eslint.config.mjs`
- **Testing:** Vitest with `--passWithNoTests` (packages may have no tests yet)
- **ESM only:** All packages are `"type": "module"`
- **Database enums:** Use lookup/reference tables (e.g. `node_types`) instead of `ENUM` types or `CHECK ... IN (...)` constraints. Store the foreign key ID in the referencing table and JOIN to resolve the name.
