cmux_codex_repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || return 1
}

cmux_codex_launcher_path() {
  repo_root="$(cmux_codex_repo_root)" || return 1
  launcher="$repo_root/scripts/codex-home-launch.sh"
  hooks_template="$repo_root/.codex/autopilot-hooks.json"
  if [ -x "$launcher" ] && [ -f "$hooks_template" ]; then
    printf '%s\n' "$launcher"
    return 0
  fi
  return 1
}

codex() {
  if [ "${CMUX_CODEX_USE_HOME_HOOKS:-0}" = "1" ]; then
    command codex "$@"
    return $?
  fi

  launcher="$(cmux_codex_launcher_path)" || {
    command codex "$@"
    return $?
  }

  if [ "${CMUX_CODEX_WRAPPER_DEBUG:-0}" = "1" ]; then
    printf '%s\n' "cmux codex helper: using $launcher" >&2
  fi

  "$launcher" "$@"
}
