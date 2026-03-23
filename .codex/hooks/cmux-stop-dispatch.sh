#!/usr/bin/env bash
set -euo pipefail

emit_allow() {
  jq -nc '{}'
}

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

route_to_workspace_hook() {
  local workspace_root="$1"
  local relative_hook_path="$2"
  local hook_path="${workspace_root}/${relative_hook_path}"

  if [[ ! -f "$hook_path" ]]; then
    return 1
  fi

  printf '%s' "$HOOK_INPUT" | bash "$hook_path"
}

route_to_home_hook() {
  local hook_name="$1"
  local codex_home=""
  local hook_path=""

  if [[ -n "${CODEX_HOME:-}" ]]; then
    codex_home="$CODEX_HOME"
  else
    codex_home="$HOME/.codex"
  fi

  hook_path="${codex_home}/hooks/${hook_name}"
  if [[ ! -f "$hook_path" ]]; then
    return 1
  fi

  printf '%s' "$HOOK_INPUT" | bash "$hook_path"
}

HOOK_INPUT="$(cat)"
HOOK_CWD="$(jq -r '.cwd // empty' <<<"$HOOK_INPUT" 2>/dev/null || true)"
WORKSPACE_ROOT="$(resolve_workspace_root "$HOOK_CWD")"
RALPH_STATE_FILE="${WORKSPACE_ROOT}/.codex/ralph-loop-state.json"

if [[ -f "$RALPH_STATE_FILE" ]]; then
  if route_to_workspace_hook "$WORKSPACE_ROOT" ".codex/hooks/ralph-loop-stop.sh"; then
    exit 0
  fi

  if route_to_home_hook "ralph-loop-stop.sh"; then
    exit 0
  fi

  emit_allow
  exit 0
fi

if [[ "${CMUX_AUTOPILOT_ENABLED:-0}" = "1" ]] || [[ "${CMUX_CODEX_HOOKS_ENABLED:-0}" = "1" ]]; then
  if route_to_workspace_hook "$WORKSPACE_ROOT" ".codex/hooks/autopilot-stop.sh"; then
    exit 0
  fi

  emit_allow
  exit 0
fi

emit_allow
