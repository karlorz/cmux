#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/apps/client"
BASE_APP_NAME="cmux-staging"
APP_PROCESS_PATTERN="$BASE_APP_NAME"
APP_BUNDLE_ID="com.cmux.app"

get_current_branch_name() {
  if [[ -n "${CMUX_STAGING_BRANCH_OVERRIDE:-}" ]]; then
    echo "$CMUX_STAGING_BRANCH_OVERRIDE"
    return
  fi

  if ! command -v git >/dev/null 2>&1; then
    return
  fi

  local branch
  branch="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
    branch="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || true)"
  fi

  echo "$branch"
}

sanitize_branch_segment() {
  local raw="$1"
  local sanitized
  sanitized="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g')"
  sanitized="${sanitized#-}"
  sanitized="${sanitized%-}"
  sanitized="$(printf '%s' "$sanitized" | sed -E 's/-+/-/g')"
  printf '%s' "$sanitized"
}

derive_branch_segment() {
  local raw_branch="$1"
  local sanitized
  sanitized="$(sanitize_branch_segment "$raw_branch")"
  if [[ -n "$sanitized" ]]; then
    printf '%s' "$sanitized"
    return
  fi

  if command -v git >/dev/null 2>&1; then
    local commit_hash
    commit_hash="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || true)"
    sanitized="$(sanitize_branch_segment "$commit_hash")"
    printf '%s' "$sanitized"
  fi
}

get_app_name_limit() {
  local uname_out
  uname_out="$(uname -s 2>/dev/null || echo unknown)"
  case "$uname_out" in
    Darwin)
      echo 128
      ;;
    Linux)
      echo 255
      ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      echo 255
      ;;
    *)
      echo 255
      ;;
  esac
}

compose_app_name() {
  local base="$1"
  local branch_segment="$2"
  local limit="$3"
  local name="$base"

  if [[ -n "$branch_segment" ]]; then
    name="$base-$branch_segment"
  fi

  if [[ -z "$limit" ]] || (( limit <= 0 )) || ((${#name} <= limit)); then
    echo "$name"
    return
  fi

  local available=$(( limit - ${#base} - 1 ))
  if (( available <= 0 )); then
    echo "${base:0:limit}"
    return
  fi

  local truncated="${branch_segment:0:available}"
  truncated="${truncated%-}"
  if [[ -n "$truncated" ]]; then
    echo "$base-$truncated"
  else
    echo "$base"
  fi
}

wait_for_process_exit() {
  local pattern="$1"
  local timeout="${2:-10}"
  local deadline=$((SECONDS + timeout))

  while pgrep -f "$pattern" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 0.5
  done

  return 0
}

stop_staging_app_instances() {
  local pattern="$1"
  local bundle_id="$2"

  if ! pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "==> No running $pattern instances detected."
    return 0
  fi

  echo "==> Attempting graceful shutdown for existing $pattern..."
  local graceful_shutdown=0
  if command -v osascript >/dev/null 2>&1; then
    if osascript -e "tell application id \"$bundle_id\" to quit" >/dev/null 2>&1; then
      if wait_for_process_exit "$pattern" 5; then
        echo "==> $pattern exited after AppleScript quit request."
        graceful_shutdown=1
      fi
    fi
  fi

  if (( graceful_shutdown == 0 )); then
    echo "==> Sending SIGTERM to $pattern..."
    pkill -TERM -f "$pattern" >/dev/null 2>&1 || true
    if wait_for_process_exit "$pattern" 10; then
      echo "==> $pattern terminated after SIGTERM."
      graceful_shutdown=1
    fi
  fi

  if (( graceful_shutdown == 0 )); then
    echo "==> Forcing SIGKILL for remaining $pattern processes..." >&2
    pkill -KILL -f "$pattern" >/dev/null 2>&1 || true
    if ! wait_for_process_exit "$pattern" 5; then
      echo "WARNING: $pattern processes still running after SIGKILL." >&2
      return 1
    fi
  fi

  return 0
}

ENV_FILE=""
if [[ -f "$ROOT_DIR/.env" ]]; then
  ENV_FILE="$ROOT_DIR/.env"
elif [[ -f "$ROOT_DIR/.env.production" ]]; then
  ENV_FILE="$ROOT_DIR/.env.production"
else
  echo "ERROR: Expected either $ROOT_DIR/.env or $ROOT_DIR/.env.production to exist so staging uses env vars." >&2
  exit 1
fi

stop_staging_app_instances "$APP_PROCESS_PATTERN" "$APP_BUNDLE_ID"

BRANCH_NAME="$(get_current_branch_name)"
BRANCH_SEGMENT="$(derive_branch_segment "$BRANCH_NAME")"
APP_NAME_LIMIT="$(get_app_name_limit)"
APP_NAME="$(compose_app_name "$BASE_APP_NAME" "$BRANCH_SEGMENT" "$APP_NAME_LIMIT")"

if [[ -n "$BRANCH_SEGMENT" ]]; then
  echo "==> Building $APP_NAME for branch ${BRANCH_NAME:-unknown} (limit $APP_NAME_LIMIT) with env file: $ENV_FILE"
else
  echo "==> Building $APP_NAME with env file: $ENV_FILE"
fi

(cd "$CLIENT_DIR" && CMUX_APP_NAME="$APP_NAME" bun run --env-file "$ENV_FILE" build:mac:workaround)
