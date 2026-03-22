#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
HOOKS_TEMPLATE="${CMUX_CODEX_HOOKS_TEMPLATE:-$REPO_ROOT/.codex/autopilot-hooks.json}"
BASE_HOME="${CODEX_HOME:-$HOME/.codex}"
TEMP_HOME=$(mktemp -d "${TMPDIR:-/tmp}/cmux-codex-home-XXXXXX")

cleanup() {
  rm -rf "$TEMP_HOME"
}
trap cleanup EXIT INT TERM HUP

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
    if [ "$name" = "." ] || [ "$name" = ".." ] || [ "$name" = "hooks.json" ]; then
      continue
    fi
    ln -s "$path" "$TEMP_HOME/$name"
  done
fi

hooks_mode="disabled"
if [ "${CMUX_AUTOPILOT_ENABLED:-0}" = "1" ] || [ "${CMUX_CODEX_HOOKS_ENABLED:-0}" = "1" ]; then
  if [ ! -f "$HOOKS_TEMPLATE" ]; then
    echo "Missing Codex hooks template: $HOOKS_TEMPLATE" >&2
    exit 1
  fi
  cp "$HOOKS_TEMPLATE" "$TEMP_HOME/hooks.json"
  hooks_mode="enabled"
fi

debug_log "repo_root=$REPO_ROOT"
debug_log "base_home=$BASE_HOME"
debug_log "temp_home=$TEMP_HOME"
debug_log "hooks_mode=$hooks_mode"
if [ "$hooks_mode" = "enabled" ]; then
  debug_log "hooks_template=$HOOKS_TEMPLATE"
fi

export CODEX_HOME="$TEMP_HOME"
exec codex "$@"
