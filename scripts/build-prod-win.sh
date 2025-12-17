#!/bin/bash
# Build cmux Electron app for Windows (production)
#
# Usage: ./scripts/build-prod-win.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/apps/client"

# Prefer production env for packaging; fall back to .env if missing
ENV_FILE="$ROOT_DIR/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$ROOT_DIR/.env"
fi

echo "==> Using env file: $ENV_FILE"
echo "==> Building cmux for Windows..."

# Generate OpenAPI client first
echo "==> Generating OpenAPI client..."
(cd "$ROOT_DIR/apps/www" && bun run generate-openapi-client)

# Build the Electron app for Windows
echo "==> Building Electron app..."
(cd "$CLIENT_DIR" && bun run --env-file "$ENV_FILE" build:win)

echo "==> Build complete!"
echo "==> Output: $CLIENT_DIR/dist-electron/"
ls -la "$CLIENT_DIR/dist-electron/"*.exe 2>/dev/null || echo "(no .exe files found)"
