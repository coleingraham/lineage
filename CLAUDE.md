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

### Conventions

- **Commits:** Conventional commits (`feat:`, `fix:`, `chore:`, etc.)
- **Branches:** `type/description` (e.g. `feat/add-search`)
- **Formatting:** Prettier with single quotes, semicolons, trailing commas, 100 char width
- **Linting:** Shared config in `@lineage/eslint-config`, each package imports it via `eslint.config.mjs`
- **Testing:** Vitest with `--passWithNoTests` (packages may have no tests yet)
- **ESM only:** All packages are `"type": "module"`
