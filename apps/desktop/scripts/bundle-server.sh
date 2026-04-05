#!/usr/bin/env bash
# Bundles the Lineage server into a self-contained directory for the desktop app.
# Output: apps/desktop/server-sidecar/
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DESKTOP_DIR/../.." && pwd)"
OUT_DIR="$DESKTOP_DIR/src-tauri/server-sidecar"

echo "[bundle-server] Bundling server into $OUT_DIR"

# Clean previous bundle
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/node_modules"

# Bundle server source with esbuild (better-sqlite3 is a native addon, keep external)
npx esbuild "$REPO_ROOT/apps/server/src/serve.ts" \
  --bundle --platform=node --target=node22 --format=cjs \
  --outfile="$OUT_DIR/serve.cjs" \
  --external:better-sqlite3

# Copy better-sqlite3 native addon + its dependencies
BETTER_SQLITE3_DIR="$(find "$REPO_ROOT/node_modules/.pnpm" -path "*/better-sqlite3/package.json" -not -path "*/node_modules/.pnpm/better-sqlite3/node_modules/*" | head -1 | xargs dirname)"
cp -r "$BETTER_SQLITE3_DIR" "$OUT_DIR/node_modules/better-sqlite3"

BINDINGS_DIR="$(find "$REPO_ROOT/node_modules/.pnpm" -path "*/bindings@*/node_modules/bindings" -type d | head -1)"
cp -r "$BINDINGS_DIR" "$OUT_DIR/node_modules/bindings"

FILE_URI_DIR="$(find "$REPO_ROOT/node_modules/.pnpm" -path "*/file-uri-to-path@*/node_modules/file-uri-to-path" -type d | head -1)"
cp -r "$FILE_URI_DIR" "$OUT_DIR/node_modules/file-uri-to-path"

# Minimal package.json so require() resolution works
echo '{"name":"lineage-server-sidecar","private":true}' > "$OUT_DIR/package.json"

echo "[bundle-server] Done ($(du -sh "$OUT_DIR" | cut -f1) total)"
