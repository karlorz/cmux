#!/bin/bash
#
# dev-electron-simple.sh - Start Electron dev without native Rust build
#
# Usage: ./scripts/dev-electron-simple.sh
#
# This is a simplified script that skips the native Rust addon build
# and just starts the Electron app directly.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if it exists
if [ -f "$ROOT_DIR/.env" ]; then
    echo "Loading .env file"
    set -a
    . "$ROOT_DIR/.env"
    set +a
fi

echo "Starting Electron dev (simple mode - no Rust/native build)..."

# Generate OpenAPI client first
echo "==> Generating OpenAPI client..."
(cd "$ROOT_DIR/apps/www" && bun run generate-openapi-client)

# Start Electron dev directly (bypassing predev:electron hook)
echo "==> Starting Electron..."
cd "$ROOT_DIR/apps/client"
bunx electron-vite dev -c electron.vite.config.ts
