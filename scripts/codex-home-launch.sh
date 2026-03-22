#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
AUTOPILOT_HOOKS_TEMPLATE="${CMUX_CODEX_HOOKS_TEMPLATE:-$REPO_ROOT/.codex/autopilot-hooks.json}"
RALPH_HOOKS_TEMPLATE="${CMUX_CODEX_RALPH_HOOKS_TEMPLATE:-$REPO_ROOT/.codex/ralph-loop-hooks.json}"
RALPH_STATE_FILE="${CMUX_CODEX_RALPH_STATE_FILE:-$REPO_ROOT/.codex/ralph-loop-state.json}"
BASE_HOME="${CODEX_HOME:-$HOME/.codex}"
TEMP_HOME=$(mktemp -d "${TMPDIR:-/tmp}/cmux-codex-home-XXXXXX")

cleanup() {
  rm -rf "$TEMP_HOME"
}
trap cleanup EXIT INT TERM HUP

should_skip_home_entry() {
  name=$1
  case "$name" in
    .|..|.DS_Store|hooks.json|archived_sessions|history.jsonl|log|session_index.jsonl|sessions|shell_snapshots|sqlite|tmp|worktrees)
      return 0
      ;;
    logs_*.sqlite|logs_*.sqlite-*|state_*.sqlite|state_*.sqlite-*)
      return 0
      ;;
  esac
  return 1
}

debug_log() {
  if [ "${CMUX_CODEX_WRAPPER_DEBUG:-0}" = "1" ]; then
    printf '%s\n' "cmux codex wrapper: $*" >&2
  fi
}

if [ "${CMUX_CODEX_USE_HOME_HOOKS:-0}" = "1" ]; then
  debug_log "bypass=home-hooks"
  exec codex "$@"
fi

mkdir -p "$TEMP_HOME"

if [ -d "$BASE_HOME" ]; then
  for path in "$BASE_HOME"/* "$BASE_HOME"/.[!.]* "$BASE_HOME"/..?*; do
    [ -e "$path" ] || continue
    name=$(basename "$path")
    if should_skip_home_entry "$name"; then
      continue
    fi
    ln -s "$path" "$TEMP_HOME/$name"
  done
fi

hooks_mode="disabled"
selected_hooks_template=""
if [ -f "$RALPH_STATE_FILE" ]; then
  selected_hooks_template="$RALPH_HOOKS_TEMPLATE"
  hooks_mode="ralph-loop"
elif [ "${CMUX_AUTOPILOT_ENABLED:-0}" = "1" ] || [ "${CMUX_CODEX_HOOKS_ENABLED:-0}" = "1" ]; then
  selected_hooks_template="$AUTOPILOT_HOOKS_TEMPLATE"
  hooks_mode="autopilot"
fi

if [ -n "$selected_hooks_template" ]; then
  if [ ! -f "$selected_hooks_template" ]; then
    echo "Missing Codex hooks template: $selected_hooks_template" >&2
    exit 1
  fi
  cp "$selected_hooks_template" "$TEMP_HOME/hooks.json"
fi

debug_log "repo_root=$REPO_ROOT"
debug_log "base_home=$BASE_HOME"
debug_log "temp_home=$TEMP_HOME"
debug_log "hooks_mode=$hooks_mode"
if [ -n "$selected_hooks_template" ]; then
  debug_log "hooks_template=$selected_hooks_template"
fi

export CODEX_HOME="$TEMP_HOME"
exec codex "$@"
