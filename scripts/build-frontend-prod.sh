#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
DIST_DIR="$FRONTEND_DIR/dist"

echo "Building frontend for production"
echo "Frontend dir: $FRONTEND_DIR"
echo "Output dir: $DIST_DIR"

cd "$FRONTEND_DIR"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/assets"

if [ ! -d "node_modules" ]; then
  bun install --frozen-lockfile
fi

bunx tailwindcss -i ./src/index.css -o ./dist/output.css --minify

bun build ./src/main.tsx \
  --outdir ./dist/assets \
  --target browser \
  --minify \
  --entry-naming '[name]-[hash].js'

cp ./index.html ./dist/index.html

BUNDLE_FILE="$(basename "$(ls ./dist/assets/main-*.js)")"
sed -i.bak "s|\./dist/output.css|/output.css|g" ./dist/index.html
sed -i.bak "s|\./src/main.tsx|/assets/$BUNDLE_FILE|g" ./dist/index.html
sed -i.bak 's|window.LAZYFLOW_API_BASE_URL = "[^"]*"|window.LAZYFLOW_API_BASE_URL = ""|g' ./dist/index.html
rm -f ./dist/index.html.bak

test -f ./dist/index.html
test -f ./dist/output.css
test -f "./dist/assets/$BUNDLE_FILE"

echo "Frontend build complete"
