#!/usr/bin/env bash
set -euo pipefail

# Staging build script
# Builds Electron app with production env variables but names it "cmux-staging"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/apps/client"
ENTITLEMENTS="$CLIENT_DIR/build/entitlements.mac.plist"
DIST_DIR="$CLIENT_DIR/dist-electron"

ARCH_EXPECTED="arm64"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--env-file path] [--skip-install]

Builds cmux-staging app for macOS arm64 using production environment variables.

Optional env vars:
  DEBUG                  Set to 'electron-osx-sign*,electron-notarize*' for verbose logs

Options:
  --env-file path        Source environment variables from a file before running
  --skip-install         Skip 'bun install --frozen-lockfile'

Notes:
  - This script builds a staging version with production env vars
  - The app will be named "cmux-staging" with bundle ID "com.cmux.staging"
  - This script does NOT sign or notarize the app
EOF
}

ENV_FILE=""
SKIP_INSTALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      if [[ -z "$ENV_FILE" ]]; then
        echo "--env-file requires a path" >&2
        exit 1
      fi
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

# Preconditions
if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script must run on macOS." >&2
  exit 1
fi

HOST_ARCH="$(uname -m)"
if [[ "$HOST_ARCH" != "$ARCH_EXPECTED" ]]; then
  echo "Warning: Host architecture is '$HOST_ARCH', expected '$ARCH_EXPECTED'." >&2
  echo "Continuing anyway..." >&2
fi

command -v bun >/dev/null 2>&1 || { echo "bun is required. Install from https://bun.sh" >&2; exit 1; }

# Load production env vars (or specified env file)
if [[ -n "$ENV_FILE" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Env file not found: $ENV_FILE" >&2
    exit 1
  fi
  echo "==> Loading env from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
elif [[ -f "$ROOT_DIR/.env.production" ]]; then
  echo "==> Loading env from .env.production"
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env.production"
  set +a
elif [[ -f "$ROOT_DIR/.env" ]]; then
  echo "==> Loading env from .env"
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
else
  echo "Warning: No .env.production or .env file found. Proceeding without env vars." >&2
fi

echo "==> Preparing macOS entitlements"
bash "$ROOT_DIR/scripts/prepare-macos-entitlements.sh"

echo "==> Generating icons"
(cd "$CLIENT_DIR" && bun run ./scripts/generate-icons.mjs)

if [[ ! -f "$ENTITLEMENTS" ]]; then
  echo "Entitlements file missing at $ENTITLEMENTS" >&2
  exit 1
fi

if [[ "$SKIP_INSTALL" != "true" ]]; then
  echo "==> Installing dependencies (bun install --frozen-lockfile)"
  (cd "$ROOT_DIR" && bun install --frozen-lockfile)
fi

echo "==> Building staging app (using production env vars, named cmux-staging)"
(cd "$CLIENT_DIR" && bash ./build-mac-staging-workaround.sh)

echo "==> Done. Outputs in: $DIST_DIR"
