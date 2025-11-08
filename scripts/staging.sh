#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/apps/client"
ENV_FILE="$ROOT_DIR/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Missing .env.production at $ENV_FILE; staging build requires production env vars." >&2
  exit 1
fi

echo "==> Building cmux-staging Electron bundle using $ENV_FILE"

(cd "$CLIENT_DIR" && CMUX_ELECTRON_APP_NAME="cmux-staging" bun run --env-file "$ENV_FILE" build:mac:workaround)
