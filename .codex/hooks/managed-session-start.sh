#!/usr/bin/env bash
set -euo pipefail

trimmed_non_empty() {
  local value="$1"
  [[ -n "${value//[[:space:]]/}" ]]
}

resolve_workspace_root() {
  local candidate="$1"

  if ! trimmed_non_empty "$candidate" || [[ ! -d "$candidate" ]]; then
    candidate="$(pwd)"
  fi

  git -C "$candidate" rev-parse --show-toplevel 2>/dev/null || printf '%s\n' "$candidate"
}

session_workspace_file() {
  local session_id="$1"
  local template="${CMUX_CODEX_SESSION_WORKSPACE_FILE_TEMPLATE:-/tmp/codex-session-workspace-root-%s}"

  printf "$template" "$session_id"
}

HOOK_INPUT="$(cat)"
HOOK_CWD="$(jq -r '.cwd // empty' <<<"$HOOK_INPUT" 2>/dev/null || true)"
read -r SESSION_ID SOURCE < <(jq -r '[.session_id // "default", .source // "startup"] | @tsv' <<<"$HOOK_INPUT" 2>/dev/null || printf 'default\tstartup\n')
SESSION_ID="${SESSION_ID:-default}"
SOURCE="${SOURCE:-startup}"
WORKSPACE_ROOT="$(resolve_workspace_root "$HOOK_CWD")"
WORKSPACE_FILE="$(session_workspace_file "$SESSION_ID")"
CURRENT_FILE="${CMUX_CODEX_CURRENT_WORKSPACE_FILE:-/tmp/codex-current-workspace-root}"

printf '%s\n' "$WORKSPACE_ROOT" >"$WORKSPACE_FILE"
printf '%s\n' "$WORKSPACE_ROOT" >"$CURRENT_FILE"

WORKSPACE_SESSION_START="${WORKSPACE_ROOT}/.codex/hooks/session-start.sh"
if [[ -f "$WORKSPACE_SESSION_START" ]]; then
  printf '%s' "$HOOK_INPUT" | bash "$WORKSPACE_SESSION_START"
  exit 0
fi

cat <<EOF
Session source: ${SOURCE}.
Review AGENTS.md and follow repository instructions before making changes.
EOF
