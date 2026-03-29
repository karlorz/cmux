#!/bin/bash
set -euo pipefail

PROVIDER="${AUTOPILOT_PROVIDER:-claude}"

if [ "${1:-}" = "--provider" ]; then
  PROVIDER="${2:-}"
  shift 2
fi

MODE="${1:-reset}"

case "$PROVIDER" in
  claude)
    STATE_PREFIX="claude-autopilot"
    CURRENT_SESSION_FILE="/tmp/claude-current-session-id"
    ;;
  codex)
    STATE_PREFIX="codex-autopilot"
    CURRENT_SESSION_FILE="/tmp/codex-current-session-id"
    ;;
  *)
    echo "Unsupported provider: $PROVIDER" >&2
    exit 1
    ;;
esac

MAX_TURNS="${AUTOPILOT_MAX_TURNS:-${CMUX_AUTOPILOT_MAX_TURNS:-${CLAUDE_AUTOPILOT_MAX_TURNS:-20}}}"
DEBUG_FLAG_FILE="/tmp/${STATE_PREFIX}-debug-enabled"
DEBUG_LOG="/tmp/${STATE_PREFIX}-debug.log"

read_optional_file() {
  local path="$1"
  if [ -f "$path" ]; then
    tr -d '\n' < "$path"
  fi
}

format_bool() {
  if [ "${1:-0}" = "1" ]; then
    printf 'yes'
  else
    printf 'no'
  fi
}

format_optional_value() {
  local value="${1:-}"
  if [ -n "$value" ]; then
    printf '%s' "$value"
  else
    printf 'unset'
  fi
}

current_session_id() {
  read_optional_file "$CURRENT_SESSION_FILE"
}

pid_file_for_session() {
  local sid="$1"
  printf '/tmp/%s-pid-%s\n' "$STATE_PREFIX" "$sid"
}

session_pid() {
  local sid="$1"
  read_optional_file "$(pid_file_for_session "$sid")"
}

provider_command_pattern() {
  printf '(^|[[:space:]/])%s([[:space:]]|$)\n' "$PROVIDER"
}

pid_is_live() {
  local pid="$1"
  [ -n "$pid" ] || return 1

  # Use ps -p directly; it fails if process doesn't exist (no need for kill -0)
  local cmd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null)" || return 1
  [ -n "$cmd" ] || return 1

  printf '%s\n' "$cmd" | grep -Eq "$(provider_command_pattern)"
}

session_is_live() {
  local sid="$1"
  local pid
  pid="$(session_pid "$sid")"
  pid_is_live "$pid"
}

prune_stale_runtime_state() {
  local sid="$1"
  local runtime_files=(
    "/tmp/${STATE_PREFIX}-blocked-${sid}"
    "/tmp/${STATE_PREFIX}-stop-${sid}"
    "/tmp/${STATE_PREFIX}-state-${sid}"
    "/tmp/${STATE_PREFIX}-idle-${sid}"
    "/tmp/${STATE_PREFIX}-wrapup-${sid}"
    "$(pid_file_for_session "$sid")"
  )

  # Skip pruning if session is still live
  session_is_live "$sid" && return 1

  # rm -f is idempotent; no need to check existence first
  rm -f "${runtime_files[@]}" 2>/dev/null
  return 0
}

debug_status() {
  if [ "${CMUX_AUTOPILOT_DEBUG:-0}" = "1" ]; then
    printf 'on (env)\n'
    return 0
  fi

  if [ -f "$DEBUG_FLAG_FILE" ]; then
    printf 'on (flag)\n'
    return 0
  fi

  printf 'off\n'
}

codex_home_dir() {
  if [ -n "${CODEX_HOME:-}" ]; then
    printf '%s\n' "$CODEX_HOME"
  else
    printf '%s/.codex\n' "$HOME"
  fi
}

codex_hooks_file() {
  printf '%s/hooks.json\n' "$(codex_home_dir)"
}

codex_config_file() {
  printf '%s/config.toml\n' "$(codex_home_dir)"
}

codex_home_hook_file() {
  printf '%s/hooks/autopilot-stop.sh\n' "$(codex_home_dir)"
}

session_workspace_file() {
  local sid="$1"
  local template="${CMUX_CODEX_SESSION_WORKSPACE_FILE_TEMPLATE:-/tmp/${PROVIDER}-session-workspace-root-%s}"

  printf "$template" "$sid"
}

current_workspace_file() {
  printf '%s\n' "${CMUX_CODEX_CURRENT_WORKSPACE_FILE:-/tmp/${PROVIDER}-current-workspace-root}"
}

session_workspace_root() {
  local sid="$1"
  local workspace_file=""
  local workspace_root=""

  if [ -n "$sid" ]; then
    workspace_file="$(session_workspace_file "$sid")"
    workspace_root="$(read_optional_file "$workspace_file")"
  fi

  if [ -z "$workspace_root" ]; then
    workspace_root="$(read_optional_file "$(current_workspace_file)")"
  fi

  if [ -n "$workspace_root" ] && [ -d "$workspace_root" ]; then
    printf '%s\n' "$workspace_root"
  fi
}

codex_managed_hooks_installed() {
  local hooks_file
  hooks_file="$(codex_hooks_file)"
  [ -f "$hooks_file" ] || return 1

  grep -Fq 'cmux-stop-dispatch.sh' "$hooks_file" &&
    grep -Fq 'managed-session-start.sh' "$hooks_file"
}

codex_hooks_feature_enabled() {
  local config_file
  config_file="$(codex_config_file)"
  [ -f "$config_file" ] || return 1

  grep -Eq '^[[:space:]]*codex_hooks[[:space:]]*=[[:space:]]*true([[:space:]]*(#.*)?)?$' "$config_file"
}

proc_env_value() {
  local pid="$1"
  local key="$2"
  local env_file="/proc/${pid}/environ"
  [ -n "$pid" ] || return 1
  [ -r "$env_file" ] || return 1

  tr '\0' '\n' < "$env_file" | grep -m1 "^${key}=" | sed "s/^${key}=//"
}

shell_env_value() {
  local key="$1"
  printenv "$key" 2>/dev/null || true
}

print_codex_diagnosis() {
  local sid="$1"
  local has_run="$2"
  local pid="$3"
  local session_live="$4"

  [ "$PROVIDER" = "codex" ] || return 0

  local managed_hooks=0
  local hooks_feature=0
  local workspace_root=""
  local workspace_hook=0
  local home_hook=0
  local codex_hooks_env=""
  local autopilot_env=""
  local env_scope="shell_env"
  local reason=""

  codex_managed_hooks_installed && managed_hooks=1
  codex_hooks_feature_enabled && hooks_feature=1

  workspace_root="$(session_workspace_root "$sid")"
  if [ -n "$workspace_root" ] && [ -f "${workspace_root}/.codex/hooks/autopilot-stop.sh" ]; then
    workspace_hook=1
  fi
  if [ -f "$(codex_home_hook_file)" ]; then
    home_hook=1
  fi

  if [ "$session_live" -eq 1 ]; then
    codex_hooks_env="$(proc_env_value "$pid" "CMUX_CODEX_HOOKS_ENABLED" || true)"
    autopilot_env="$(proc_env_value "$pid" "CMUX_AUTOPILOT_ENABLED" || true)"
    env_scope="process_env"
  else
    codex_hooks_env="$(shell_env_value "CMUX_CODEX_HOOKS_ENABLED")"
    autopilot_env="$(shell_env_value "CMUX_AUTOPILOT_ENABLED")"
  fi

  if [ "$has_run" = "0" ]; then
    if [ "$managed_hooks" -ne 1 ] || [ "$hooks_feature" -ne 1 ]; then
      reason="Codex hook wiring is incomplete. Install the managed home hooks so SessionStart and Stop are registered and [features] codex_hooks = true."
    elif [ "$workspace_hook" -ne 1 ] && [ "$home_hook" -ne 1 ]; then
      reason="No autopilot stop hook is available for the recorded workspace or Codex home, so Stop events cannot continue the session."
    elif [ "$codex_hooks_env" != "1" ] && [ "$autopilot_env" != "1" ]; then
      reason="This Codex session was not launched with CMUX_CODEX_HOOKS_ENABLED=1 or CMUX_AUTOPILOT_ENABLED=1 in the live process environment. Exporting after Codex starts does not update the running session."
    elif [ "$session_live" -ne 1 ] && [ -z "$pid" ]; then
      reason="No live session PID is recorded for the latest session, so status can only inspect shell-level state. If you exported the env vars after launching Codex, restart Codex so the process inherits them."
    else
      reason="The hook wiring and env look enabled, but no Stop-hook turn has been recorded yet. This usually means the recorded session has not hit the Stop hook path yet."
    fi
  else
    reason="At least one Stop-hook turn was recorded for this session, so Codex autopilot did start."
  fi

  echo "Autopilot diagnosis: managed hooks=$(format_bool "$managed_hooks"), codex_hooks=$( [ "$hooks_feature" -eq 1 ] && printf 'true' || printf 'false' ), workspace_hook=$(format_bool "$workspace_hook"), home_hook=$(format_bool "$home_hook"), session_pid=${pid:-missing}, ${env_scope} CMUX_CODEX_HOOKS_ENABLED=$(format_optional_value "$codex_hooks_env") CMUX_AUTOPILOT_ENABLED=$(format_optional_value "$autopilot_env")"
  echo "Likely reason: $reason"
}

session_status_text() {
  local sid="$1"
  local has_run="$2"
  local stale_runtime="$3"

  if [ -f "/tmp/${STATE_PREFIX}-stop-${sid}" ]; then
    printf 'stop-pending'
  elif [ -f "/tmp/${STATE_PREFIX}-blocked-${sid}" ]; then
    printf 'blocked-live'
  elif [ "$has_run" = "0" ]; then
    printf 'idle'
  elif [ "$stale_runtime" -eq 1 ]; then
    printf 'ready-exited'
  else
    printf 'ready-available'
  fi
}

status_current() {
  local sid
  local has_run
  local pid=""
  local session_live=0
  sid="$(current_session_id)"

  if [ -z "$sid" ]; then
    echo "Recorded latest session ID: (not set - restart session to enable)"
    exit 0
  fi

  local turns_file="/tmp/${STATE_PREFIX}-turns-${sid}"
  pid="$(session_pid "$sid")"
  if pid_is_live "$pid"; then
    session_live=1
  fi
  local stale_runtime=0
  if prune_stale_runtime_state "$sid"; then
    stale_runtime=1
  fi

  echo "Provider: $PROVIDER"
  echo "Recorded latest session ID: ${sid}"
  echo "Max turns: $MAX_TURNS"
  echo "Debug: $(debug_status)"
  echo "Debug log: $DEBUG_LOG"

  if [ -f "$turns_file" ]; then
    echo "Hook turn: $(cat "$turns_file")"
    has_run=1
  else
    echo "Hook turn: 0"
    has_run=0
  fi

  if [ -f "/tmp/${STATE_PREFIX}-stop-${sid}" ]; then
    echo "Status: STOP (will stop on next turn)"
  elif [ -f "/tmp/${STATE_PREFIX}-blocked-${sid}" ]; then
    echo "Status: BLOCKED (actively running)"
  elif [ "$has_run" = "0" ]; then
    echo "Status: idle (not started)"
  elif [ "$stale_runtime" -eq 1 ]; then
    echo "Status: ready (last session exited)"
  else
    echo "Status: ready (available)"
  fi

  print_codex_diagnosis "$sid" "$has_run" "$pid" "$session_live"
}

status_all() {
  local current_sid
  current_sid="$(current_session_id)"

  echo "Provider: $PROVIDER"
  echo "Max turns: $MAX_TURNS"
  echo "Debug: $(debug_status)"
  echo "Debug log: $DEBUG_LOG"
  echo "Recorded latest session: ${current_sid:-"(not set)"}"
  echo ""
  echo "Recorded sessions with hook state:"

  local found=0
  local f=""
  shopt -s nullglob 2>/dev/null || true
  for f in /tmp/${STATE_PREFIX}-turns-*; do
    [ -f "$f" ] || continue
    found=1
    local sid="${f#/tmp/${STATE_PREFIX}-turns-}"
    local stale_runtime=0
    if prune_stale_runtime_state "$sid"; then
      stale_runtime=1
    fi
    local turns
    turns="$(cat "$f")"
    local status_text
    status_text="$(session_status_text "$sid" "1" "$stale_runtime")"
    local current_marker=""
    if [ "$sid" = "$current_sid" ]; then
      current_marker=" recorded_current=yes"
    fi
    echo "  ${sid:0:20}...: hook_turn $turns status=$status_text$current_marker"
  done

  if [ "$found" -eq 0 ]; then
    echo "  (none)"
  fi
}

stop_current() {
  local sid
  sid="$(current_session_id)"

  if [ -z "$sid" ]; then
    echo "No session ID found. Restart session to enable."
    exit 1
  fi

  touch "/tmp/${STATE_PREFIX}-stop-${sid}"
  echo "Stop file created for latest recorded session: ${sid:0:20}..."
  echo "Autopilot will stop on next turn."
}

reset_session() {
  local sid="$1"
  rm -f \
    "/tmp/${STATE_PREFIX}-turns-${sid}" \
    "/tmp/${STATE_PREFIX}-stop-${sid}" \
    "/tmp/${STATE_PREFIX}-blocked-${sid}" \
    "/tmp/${STATE_PREFIX}-completed-${sid}" \
    "/tmp/${STATE_PREFIX}-wrapup-${sid}" \
    "/tmp/${STATE_PREFIX}-state-${sid}" \
    "/tmp/${STATE_PREFIX}-idle-${sid}" \
    "$(pid_file_for_session "$sid")"
}

reset_current() {
  local sid
  sid="$(current_session_id)"

  if [ -z "$sid" ]; then
    echo "No session ID found. Restart session to enable."
    exit 1
  fi

  reset_session "$sid"
  echo "Reset latest recorded session: ${sid:0:20}..."
  echo "Next cycle will start from turn 1/$MAX_TURNS"
}

reset_all() {
  local count=0
  local f=""
  shopt -s nullglob 2>/dev/null || true
  for f in /tmp/${STATE_PREFIX}-turns-*; do
    [ -f "$f" ] || continue
    local sid="${f#/tmp/${STATE_PREFIX}-turns-}"
    reset_session "$sid"
    echo "Reset: ${sid:0:20}..."
    count=$((count + 1))
  done

  echo "Reset $count session(s). Next cycle will start from turn 1/$MAX_TURNS"
}

debug_on() {
  touch "$DEBUG_FLAG_FILE"
  echo "Autopilot debug enabled for provider: $PROVIDER"
  echo "Debug log: $DEBUG_LOG"
}

debug_off() {
  rm -f "$DEBUG_FLAG_FILE"
  echo "Autopilot debug disabled for provider: $PROVIDER"
  echo "Debug log: $DEBUG_LOG"
}

case "$MODE" in
  status)
    status_current
    ;;
  status-all)
    status_all
    ;;
  stop)
    stop_current
    ;;
  reset)
    reset_current
    ;;
  all)
    reset_all
    ;;
  debug-on)
    debug_on
    ;;
  debug-off)
    debug_off
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    echo "Usage: $0 [--provider claude|codex] [status|status-all|stop|reset|all|debug-on|debug-off]" >&2
    exit 1
    ;;
esac
