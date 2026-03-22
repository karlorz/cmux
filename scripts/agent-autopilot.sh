#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'EOF'
agent-autopilot.sh

Run an "auto-continue" loop for ~N minutes by repeatedly invoking a coding agent
CLI non-interactively. Supports: Claude Code (claude), Codex CLI (codex), OpenCode (opencode).

Usage:
  scripts/agent-autopilot.sh --tool <claude|codex|opencode> [options] -- "mission prompt"
  scripts/agent-autopilot.sh --tool <claude|codex|opencode> [options] --resume

Options:
  --cwd <dir>              Working directory (default: current directory)
  --minutes <n>            Total duration (default: 30)
  --turn-minutes <n>       Suggested work per turn (default: 5)
  --wrap-up-minutes <n>    When <= this remains, ask for final summary (default: 3)
  --model <name>           Model to use (passed through to the selected CLI)
  --log-dir <dir>          Log root directory (default: logs/agent-autopilot)
  --stop-file <path>       If this file exists, stop after wrap-up
  --attach-url <url>       Tool-specific attach URL (OpenCode: opencode server URL)
  --resume                 Resume/continue the most recent session (if supported)
  --json                   Prefer JSON output/events when supported
  --follow                 Stream agent output to stdout while logging
  --open-monitor           Open a separate Terminal window tailing the run log
  --dry-run                Print the commands/prompts that would run (no API calls)
  -h, --help               Show this help

Examples:
  scripts/agent-autopilot.sh --tool claude --minutes 30 --cwd . -- "Fix CI and write a summary"
  scripts/agent-autopilot.sh --tool codex --minutes 30 --cwd . -- "Implement feature X end-to-end"
  scripts/agent-autopilot.sh --tool opencode --minutes 30 --cwd . -- "Deep review and harden security"

Notes:
  - Logs are written under: <log-dir>/<tool>/<timestamp>/
  - For Codex CLI, this uses: -a never -s workspace-write (unattended + sandboxed).
  - For Claude Code and OpenCode, this relies on their own permission/config defaults.
EOF
}

die() {
  echo "error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

first_set() {
  local value=""
  for value in "$@"; do
    if [[ -n "$value" ]]; then
      printf '%s\n' "$value"
      return 0
    fi
  done
}

is_pos_int() {
  [[ "${1:-}" =~ ^[0-9]+$ ]] && [[ "$1" -gt 0 ]]
}

as_abs_path() {
  local path="$1"
  if [[ "$path" = /* ]]; then
    printf '%s\n' "$path"
    return 0
  fi
  printf '%s/%s\n' "$PWD" "$path"
}

TOOL=""
CWD="$PWD"
MINUTES=30
TURN_MINUTES=5
WRAP_UP_MINUTES=3
MODEL=""
LOG_DIR="logs/agent-autopilot"
STOP_FILE=""
ATTACH_URL=""
RESUME=0
PREFER_JSON=0
FOLLOW=0
OPEN_MONITOR=0
DRY_RUN=0
CODEX_AUTOPILOT_HOME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tool)
      TOOL="${2:-}"
      shift 2
      ;;
    --cwd)
      CWD="${2:-}"
      shift 2
      ;;
    --minutes)
      MINUTES="${2:-}"
      shift 2
      ;;
    --turn-minutes)
      TURN_MINUTES="${2:-}"
      shift 2
      ;;
    --wrap-up-minutes)
      WRAP_UP_MINUTES="${2:-}"
      shift 2
      ;;
    --model)
      MODEL="${2:-}"
      shift 2
      ;;
    --log-dir)
      LOG_DIR="${2:-}"
      shift 2
      ;;
    --stop-file)
      STOP_FILE="${2:-}"
      shift 2
      ;;
    --attach-url)
      ATTACH_URL="${2:-}"
      shift 2
      ;;
    --resume)
      RESUME=1
      shift
      ;;
    --json)
      PREFER_JSON=1
      shift
      ;;
    --follow)
      FOLLOW=1
      shift
      ;;
    --open-monitor)
      OPEN_MONITOR=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

MISSION="${*:-}"

[[ -n "$TOOL" ]] || die "--tool is required (claude|codex|opencode)"
case "$TOOL" in
  claude|codex|opencode) ;;
  *) die "--tool must be one of: claude, codex, opencode" ;;
esac

is_pos_int "$MINUTES" || die "--minutes must be a positive integer"
is_pos_int "$TURN_MINUTES" || die "--turn-minutes must be a positive integer"
is_pos_int "$WRAP_UP_MINUTES" || die "--wrap-up-minutes must be a positive integer"

if [[ "$RESUME" -eq 0 && -z "$MISSION" ]]; then
  die "Missing mission prompt. Provide it after --, or use --resume."
fi

cd "$CWD" 2>/dev/null || die "Could not cd into --cwd: $CWD"
CWD="$PWD"

LOG_DIR="$(as_abs_path "$LOG_DIR")"
mkdir -p "$LOG_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
session_dir="$LOG_DIR/$TOOL/$timestamp"
mkdir -p "$session_dir"

run_log="$session_dir/run.log"
meta_file="$session_dir/meta.txt"

if [[ -z "$STOP_FILE" ]]; then
  STOP_FILE="$session_dir/STOP"
else
  STOP_FILE="$(as_abs_path "$STOP_FILE")"
fi

{
  echo "tool=$TOOL"
  echo "cwd=$CWD"
  echo "minutes=$MINUTES"
  echo "turn_minutes=$TURN_MINUTES"
  echo "wrap_up_minutes=$WRAP_UP_MINUTES"
  echo "model=${MODEL:-}"
  echo "stop_file=$STOP_FILE"
  echo "attach_url=${ATTACH_URL:-}"
  echo "resume=$RESUME"
  echo "prefer_json=$PREFER_JSON"
  echo "dry_run=$DRY_RUN"
  if [[ -n "$MISSION" ]]; then
    echo
    echo "mission:"
    echo "$MISSION"
  fi
} >"$meta_file"

case "$TOOL" in
  claude) require_cmd claude ;;
  codex) require_cmd codex ;;
  opencode) require_cmd opencode ;;
esac

print_and_log() {
  local line="$1"
  printf '%s\n' "$line" | tee -a "$run_log"
}

write_header_both() {
  local turn_file="$1"
  local content="$2"
  if [[ "$FOLLOW" -eq 1 ]]; then
    printf '%b' "$content" | tee -a "$turn_file" "$run_log"
  else
    printf '%b' "$content" | tee -a "$turn_file" "$run_log" >/dev/null
  fi
}

run_and_tee() {
  local turn_file="$1"
  shift
  local -a cmd=("$@")
  local rc=0
  if [[ "$FOLLOW" -eq 1 ]]; then
    "${cmd[@]}" 2>&1 | tee -a "$turn_file" "$run_log"
    rc="${PIPESTATUS[0]}"
  else
    "${cmd[@]}" 2>&1 | tee -a "$turn_file" "$run_log" >/dev/null
    rc="${PIPESTATUS[0]}"
  fi
  return "$rc"
}

open_monitor() {
  local logfile="$1"
  command -v osascript >/dev/null 2>&1 || return 0

  # Open a new Terminal window that tails the run log.
  # Quote carefully for AppleScript.
  local escaped_cmd=""
  escaped_cmd="cd $(printf '%q' "$CWD") && tail -n 200 -f $(printf '%q' "$logfile")"
  osascript >/dev/null 2>&1 <<EOF || true
tell application "Terminal"
  activate
  do script "$(printf '%s' "$escaped_cmd" | sed 's/\"/\\\\\"/g')"
end tell
EOF
}

start_epoch="$(date +%s)"
deadline_epoch="$((start_epoch + (MINUTES * 60)))"
wrap_up_threshold="$((WRAP_UP_MINUTES * 60))"
default_hook_max_turns=$(( (MINUTES / TURN_MINUTES) * 3 ))
if [[ "$default_hook_max_turns" -lt 1 ]]; then
  default_hook_max_turns=1
fi
hook_max_turns="$(first_set "${AUTOPILOT_MAX_TURNS:-}" "${CMUX_AUTOPILOT_MAX_TURNS:-}" "${CLAUDE_AUTOPILOT_MAX_TURNS:-}" "$default_hook_max_turns")"

# For Claude tool: export env vars for autopilot-keep-running hook integration
if [[ "$TOOL" = "claude" ]]; then
  # Explicitly enable the hook for this run. Ordinary sessions stay disabled
  # unless AUTOPILOT_KEEP_RUNNING_DISABLED=0 is set.
  export AUTOPILOT_KEEP_RUNNING_DISABLED=0
  export AUTOPILOT_STOP_FILE="$STOP_FILE"
  export CLAUDE_AUTOPILOT_STOP_FILE="$STOP_FILE"
  export AUTOPILOT_MAX_TURNS="$hook_max_turns"
  export CLAUDE_AUTOPILOT_MAX_TURNS="$hook_max_turns"
fi

# Background time-watcher: polls every 30s and touches stop file when deadline approaches
# This signals the hook to release Claude even if the outer loop hasn't regained control
WATCHER_PID=""
if [[ "$TOOL" = "claude" && "$DRY_RUN" -eq 0 ]]; then
  (
    while :; do
      sleep 30
      now="$(date +%s)"
      time_left="$((deadline_epoch - now))"
      if [[ "$time_left" -le "$wrap_up_threshold" ]]; then
        touch "$STOP_FILE"
        exit 0
      fi
    done
  ) &
  WATCHER_PID=$!
fi

# Cleanup watcher on script exit
cleanup_watcher() {
  if [[ -n "$WATCHER_PID" ]] && kill -0 "$WATCHER_PID" 2>/dev/null; then
    kill "$WATCHER_PID" 2>/dev/null || true
  fi
}

cleanup_codex_autopilot_home() {
  if [[ -n "$CODEX_AUTOPILOT_HOME" ]] && [[ -d "$CODEX_AUTOPILOT_HOME" ]]; then
    rm -rf "$CODEX_AUTOPILOT_HOME"
  fi
}

cleanup_runtime() {
  cleanup_watcher
  cleanup_codex_autopilot_home
}
trap cleanup_runtime EXIT

link_codex_home_entries() {
  local source_home="$1"
  local target_home="$2"
  local path=""
  local name=""
  local had_dotglob=0
  local had_nullglob=0

  if [[ ! -d "$source_home" ]]; then
    return 0
  fi

  if shopt -q dotglob; then
    had_dotglob=1
  fi
  if shopt -q nullglob; then
    had_nullglob=1
  fi

  shopt -s dotglob nullglob
  for path in "$source_home"/*; do
    name="$(basename "$path")"
    if [[ "$name" = "." || "$name" = ".." || "$name" = "hooks.json" ]]; then
      continue
    fi
    ln -s "$path" "$target_home/$name"
  done

  if [[ "$had_dotglob" -eq 0 ]]; then
    shopt -u dotglob
  fi
  if [[ "$had_nullglob" -eq 0 ]]; then
    shopt -u nullglob
  fi
}

ensure_codex_autopilot_home() {
  local base_home=""
  local hooks_template=""

  if [[ -n "$CODEX_AUTOPILOT_HOME" ]] && [[ -d "$CODEX_AUTOPILOT_HOME" ]]; then
    return 0
  fi

  base_home="${CODEX_HOME:-$HOME/.codex}"
  hooks_template="$CWD/.codex/autopilot-hooks.json"
  [[ -f "$hooks_template" ]] || die "Missing Codex autopilot hooks template: $hooks_template"

  CODEX_AUTOPILOT_HOME="$(mktemp -d "${TMPDIR:-/tmp}/cmux-codex-autopilot-home-XXXXXX")"
  link_codex_home_entries "$base_home" "$CODEX_AUTOPILOT_HOME"
  cp "$hooks_template" "$CODEX_AUTOPILOT_HOME/hooks.json"
}

build_start_prompt() {
  local now_epoch="$1"
  local deadline="$2"
  local turn_minutes="$3"
  local mission="$4"

  cat <<EOF
You are running in unattended autopilot mode.
I will re-invoke you repeatedly until the deadline. Do not ask me whether to continue.

Rules:
- Do not ask for confirmation to continue; just proceed.
- If you need user input, write "BLOCKED: <question>" in the output and immediately switch to the next best task.
- Keep changes small and verifiable; prefer running tests/lints when appropriate.
- End every turn with: Progress, Commands run, Files changed, Next.

Timebox this turn: about ${turn_minutes} minutes of work.
Deadline epoch seconds: ${deadline}
Now epoch seconds: ${now_epoch}

Mission:
${mission}
EOF
}

build_hooked_start_prompt() {
  local now_epoch="$1"
  local deadline="$2"
  local turn_minutes="$3"
  local mission="$4"

  cat <<EOF
You are running in unattended autopilot mode inside a resumed Codex session.
The repo-local Stop hook may continue the current Codex turn automatically once, and an outer supervisor may resume the same session repeatedly until wrap-up.

Rules:
- Do not ask for confirmation to continue; just proceed.
- If you need user input, write "BLOCKED: <question>" in the output and immediately switch to the next best task.
- Keep changes small and verifiable; prefer running tests/lints when appropriate.
- End every substantial turn with: Progress, Commands run, Files changed, Next.

Timebox each work turn: about ${turn_minutes} minutes.
Deadline epoch seconds: ${deadline}
Now epoch seconds: ${now_epoch}

Mission:
${mission}
EOF
}

build_hooked_resume_prompt() {
  local time_left="$1"
  local turn_minutes="$2"
  local mission="${3:-}"

  if [[ -n "$mission" ]]; then
    cat <<EOF
Resume this unattended autopilot session.
Time left in the overall session: ${time_left} seconds.
Timebox each work turn: about ${turn_minutes} minutes.

Continue from where you left off. The Stop hook may continue the current turn automatically, and the outer autopilot supervisor may resume the same session again until wrap-up.

Mission reminder:
${mission}
EOF
  else
    cat <<EOF
Resume this unattended autopilot session.
Time left in the overall session: ${time_left} seconds.
Timebox each work turn: about ${turn_minutes} minutes.

Continue from where you left off. The Stop hook may continue the current turn automatically, and the outer autopilot supervisor may resume the same session again until wrap-up.
EOF
  fi
}

codex_current_session_id() {
  local session_file="${CMUX_AUTOPILOT_CURRENT_SESSION_FILE:-/tmp/codex-current-session-id}"
  if [[ -f "$session_file" ]]; then
    tr -d '\n' < "$session_file"
  fi
}

codex_completed_marker_for_session() {
  local sid="$1"
  local state_prefix="${CMUX_AUTOPILOT_STATE_PREFIX:-codex-autopilot}"
  printf '/tmp/%s-completed-%s\n' "$state_prefix" "$sid"
}

codex_turns_file_for_session() {
  local sid="$1"
  local state_prefix="${CMUX_AUTOPILOT_STATE_PREFIX:-codex-autopilot}"
  printf '/tmp/%s-turns-%s\n' "$state_prefix" "$sid"
}

codex_turn_count_for_session() {
  local sid="$1"
  local turns_file=""
  if [[ -z "$sid" ]]; then
    printf '0\n'
    return 0
  fi

  turns_file="$(codex_turns_file_for_session "$sid")"
  if [[ -f "$turns_file" ]]; then
    tr -d '\n' < "$turns_file"
  else
    printf '0\n'
  fi
}

build_continue_prompt() {
  local time_left="$1"
  local turn_minutes="$2"
  cat <<EOF
Autopilot continuation.
Time left in the overall session: ${time_left} seconds.
Timebox this turn: about ${turn_minutes} minutes of work.

Continue from where you left off. Do not ask whether to continue.
End with: Progress, Commands run, Files changed, Next.
EOF
}

build_wrap_up_prompt() {
  local time_left="$1"
  cat <<EOF
Final turn (wrap up).
Time left in the overall session: ${time_left} seconds.

Stop starting large new work. Stabilize what you have, run quick checks if sensible, and write a final summary.

Output a "Self-Correction Session Summary" with:
- Completed tasks count
- PRs created (if any), with status
- Key findings (security/perf/tests)
- Remaining tasks (with why)
EOF
}

format_cmd() {
  local -a cmd=("$@")
  local out=""
  local part=""
  for part in "${cmd[@]}"; do
    out+="${out:+ }$(printf '%q' "$part")"
  done
  printf '%s\n' "$out"
}

run_turn_claude() {
  local mode="$1"
  local prompt="$2"
  local turn_file="$3"
  local -a cmd=(claude --print --effort high --permission-mode bypassPermissions)
  if [[ "$PREFER_JSON" -eq 1 ]]; then
    cmd+=(--output-format stream-json --include-partial-messages)
  else
    cmd+=(--output-format text)
  fi
  if [[ -n "$MODEL" ]]; then
    cmd+=(--model "$MODEL")
  fi
  if [[ "$mode" = "resume" ]]; then
    cmd+=(--continue)
  fi
  cmd+=("$prompt")

  : >"$turn_file"

  local header=""
  header+="timestamp: $(date '+%Y-%m-%dT%H:%M:%S%z')\n"
  header+="mode: $mode\n"
  header+="cwd: $CWD\n"
  header+="command: $(format_cmd "${cmd[@]}")\n"
  header+="\n"
  header+="prompt:\n"
  header+="$prompt\n"
  header+="\n"
  header+="output:\n"
  write_header_both "$turn_file" "$header"

  local rc=0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    write_header_both "$turn_file" "(dry-run) skipping claude invocation\n"
    rc=0
  else
    set +e
    run_and_tee "$turn_file" "${cmd[@]}"
    rc=$?
    set -e
  fi

  write_header_both "$turn_file" "\nexit_code: $rc\n"
  return "$rc"
}

run_turn_codex() {
  local mode="$1"
  local prompt="$2"
  local turn_file="$3"

  local -a base=(codex -a never -s workspace-write)
  if [[ -n "$MODEL" ]]; then
    base+=(-m "$MODEL")
  fi

  local -a cmd=("${base[@]}")
  if [[ "$mode" = "resume" ]]; then
    cmd+=(exec resume --last)
  else
    cmd+=(exec)
  fi
  if [[ "$PREFER_JSON" -eq 1 ]]; then
    cmd+=(--json)
  fi
  cmd+=("$prompt")

  : >"$turn_file"

  local header=""
  header+="timestamp: $(date '+%Y-%m-%dT%H:%M:%S%z')\n"
  header+="mode: $mode\n"
  header+="cwd: $CWD\n"
  header+="command: $(format_cmd "${cmd[@]}")\n"
  header+="\n"
  header+="prompt:\n"
  header+="$prompt\n"
  header+="\n"
  header+="output:\n"
  write_header_both "$turn_file" "$header"

  local rc=0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    write_header_both "$turn_file" "(dry-run) skipping codex invocation\n"
    rc=0
  else
    set +e
    run_and_tee "$turn_file" "${cmd[@]}"
    rc=$?
    set -e
  fi

  write_header_both "$turn_file" "\nexit_code: $rc\n"
  return "$rc"
}

run_codex_native_autopilot() {
  local mode="$1"
  local prompt="$2"
  local turn_file="$3"
  local max_turns="$4"
  local hooks_template="$CWD/.codex/autopilot-hooks.json"

  # Keep repo-local Codex hooks opt-in. Ordinary interactive sessions stay
  # quiet because the live repo does not expose `.codex/hooks.json`; autopilot
  # stages its template into a temporary CODEX_HOME just for this run.
  ensure_codex_autopilot_home
  local -a base=(codex -a never -s workspace-write --enable codex_hooks)
  if [[ -n "$MODEL" ]]; then
    base+=(-m "$MODEL")
  fi

  local -a cmd=("${base[@]}")
  if [[ "$mode" = "resume" ]]; then
    cmd+=(exec resume --last)
  else
    cmd+=(exec)
  fi
  if [[ "$PREFER_JSON" -eq 1 ]]; then
    cmd+=(--json)
  fi
  cmd+=("$prompt")

  : >"$turn_file"

  local header=""
  header+="timestamp: $(date '+%Y-%m-%dT%H:%M:%S%z')\n"
  header+="mode: $mode\n"
  header+="cwd: $CWD\n"
  header+="command: $(format_cmd "${cmd[@]}")\n"
  header+="codex_home: $CODEX_AUTOPILOT_HOME\n"
  header+="hooks_template: $hooks_template\n"
  header+="max_turns: $max_turns\n"
  header+="stop_file: $STOP_FILE\n"
  header+="\n"
  header+="prompt:\n"
  header+="$prompt\n"
  header+="\n"
  header+="output:\n"
  write_header_both "$turn_file" "$header"

  local rc=0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    write_header_both "$turn_file" "(dry-run) skipping codex native-hook invocation\n"
    rc=0
  else
    (
      while :; do
        sleep 30
        local_now="$(date +%s)"
        time_left="$((deadline_epoch - local_now))"
        if [[ "$time_left" -le "$wrap_up_threshold" ]]; then
          touch "$STOP_FILE"
          exit 0
        fi
      done
    ) &
    WATCHER_PID=$!

    set +e
    CODEX_HOME="$CODEX_AUTOPILOT_HOME" \
    AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
      AUTOPILOT_ENABLED=1 \
      AUTOPILOT_STOP_FILE="$STOP_FILE" \
      AUTOPILOT_MAX_TURNS="$max_turns" \
      CMUX_AUTOPILOT_ENABLED=1 \
      CMUX_AUTOPILOT_STOP_FILE="$STOP_FILE" \
      CMUX_AUTOPILOT_MAX_TURNS="$max_turns" \
      CMUX_AUTOPILOT_INLINE_WRAPUP=1 \
      CMUX_AUTOPILOT_CURRENT_SESSION_FILE="/tmp/codex-current-session-id" \
      run_and_tee "$turn_file" "${cmd[@]}"
    rc=$?
    set -e

    cleanup_watcher
    WATCHER_PID=""
  fi

  write_header_both "$turn_file" "\nexit_code: $rc\n"
  return "$rc"
}

run_turn_opencode() {
  local mode="$1"
  local prompt="$2"
  local turn_file="$3"

  local -a cmd=(opencode run --dir "$CWD")
  if [[ -n "$ATTACH_URL" ]]; then
    cmd+=(--attach "$ATTACH_URL")
  fi
  if [[ -n "$MODEL" ]]; then
    cmd+=(--model "$MODEL")
  fi
  if [[ "$PREFER_JSON" -eq 1 ]]; then
    cmd+=(--format json)
  fi
  if [[ "$mode" = "resume" ]]; then
    cmd+=(--continue)
  fi
  cmd+=("$prompt")

  : >"$turn_file"

  local header=""
  header+="timestamp: $(date '+%Y-%m-%dT%H:%M:%S%z')\n"
  header+="mode: $mode\n"
  header+="cwd: $CWD\n"
  header+="command: $(format_cmd "${cmd[@]}")\n"
  header+="\n"
  header+="prompt:\n"
  header+="$prompt\n"
  header+="\n"
  header+="output:\n"
  write_header_both "$turn_file" "$header"

  local rc=0
  if [[ "$DRY_RUN" -eq 1 ]]; then
    write_header_both "$turn_file" "(dry-run) skipping opencode invocation\n"
    rc=0
  else
    set +e
    run_and_tee "$turn_file" "${cmd[@]}"
    rc=$?
    set -e
  fi

  write_header_both "$turn_file" "\nexit_code: $rc\n"
  return "$rc"
}

iter=0
did_wrap_up=0
did_resume_fallback=0
stop_requested=0

print_and_log "Starting agent autopilot"
print_and_log "Logs: $session_dir"
print_and_log "Deadline epoch seconds: $deadline_epoch"
print_and_log "Stop file: $STOP_FILE (touch to stop)"
print_and_log "Hook max turns: $hook_max_turns"

if [[ "$OPEN_MONITOR" -eq 1 ]]; then
  open_monitor "$run_log"
fi

if [[ "$TOOL" = "codex" ]]; then
  while :; do
    now_epoch="$(date +%s)"
    if [[ "$now_epoch" -ge "$deadline_epoch" ]]; then
      break
    fi

    iter="$((iter + 1))"
    time_left="$((deadline_epoch - now_epoch))"

    mode="resume"
    if [[ "$iter" -eq 1 && "$RESUME" -eq 0 ]]; then
      mode="start"
    fi

    if [[ -f "$STOP_FILE" ]]; then
      stop_requested=1
    fi

    prompt=""
    if [[ "$did_wrap_up" -eq 0 && ( "$time_left" -le "$wrap_up_threshold" || "$stop_requested" -eq 1 ) ]]; then
      prompt="$(build_wrap_up_prompt "$time_left")"
      did_wrap_up=1
      touch "$STOP_FILE"
    elif [[ "$mode" = "start" ]]; then
      prompt="$(build_hooked_start_prompt "$now_epoch" "$deadline_epoch" "$TURN_MINUTES" "$MISSION")"
    else
      prompt="$(build_hooked_resume_prompt "$time_left" "$TURN_MINUTES" "$MISSION")"
    fi

    turn_file="$session_dir/turn-$(printf '%03d' "$iter").log"
    print_and_log "outer_turn=$iter tool=$TOOL mode=$mode native_hooks=1 time_left_seconds=$time_left"

    rc=0
    run_codex_native_autopilot "$mode" "$prompt" "$turn_file" "$hook_max_turns" || rc=$?

    if [[ "$rc" -ne 0 && "$iter" -eq 1 && "$mode" = "resume" && "$RESUME" -eq 1 && "$did_resume_fallback" -eq 0 ]]; then
      if [[ -n "$MISSION" ]]; then
        print_and_log "Initial resume failed; falling back to starting a new Codex session."
        RESUME=0
        did_resume_fallback=1
        iter=0
        sleep 1
        continue
      fi
      print_and_log "Initial resume failed and no mission prompt was provided."
      print_and_log "Re-run with a mission prompt after --, or without --resume."
      exit 1
    fi

    current_sid="$(codex_current_session_id)"
    current_hook_turn="$(codex_turn_count_for_session "$current_sid")"
    hook_completed=0
    if [[ -n "$current_sid" && -f "$(codex_completed_marker_for_session "$current_sid")" ]]; then
      hook_completed=1
      did_wrap_up=1
      print_and_log "outer_turn=$iter hook_session=${current_sid} hook_completed=1 reason=max-turns"
    fi
    print_and_log "outer_turn=$iter hook_session=${current_sid:-unknown} hook_turn=$current_hook_turn hook_completed=$hook_completed stop_requested=$stop_requested did_wrap_up=$did_wrap_up exit_code=$rc"

    if [[ "$rc" -ne 0 ]]; then
      print_and_log "outer_turn=$iter exit_code=$rc (see $turn_file)"
      sleep 10
    else
      sleep 2
    fi

    if [[ "$did_wrap_up" -eq 1 ]]; then
      break
    fi
  done

  print_and_log "Done. Logs: $session_dir"
  exit 0
fi

while :; do
  now_epoch="$(date +%s)"
  if [[ "$now_epoch" -ge "$deadline_epoch" ]]; then
    break
  fi

  iter="$((iter + 1))"
  time_left="$((deadline_epoch - now_epoch))"

  mode="resume"
  if [[ "$iter" -eq 1 && "$RESUME" -eq 0 ]]; then
    mode="start"
  fi

  if [[ -f "$STOP_FILE" ]]; then
    stop_requested=1
  fi

  prompt=""
  if [[ "$did_wrap_up" -eq 0 && ( "$time_left" -le "$wrap_up_threshold" || "$stop_requested" -eq 1 ) ]]; then
    prompt="$(build_wrap_up_prompt "$time_left")"
    did_wrap_up=1
  else
    if [[ "$mode" = "start" ]]; then
      prompt="$(build_start_prompt "$now_epoch" "$deadline_epoch" "$TURN_MINUTES" "$MISSION")"
    else
      prompt="$(build_continue_prompt "$time_left" "$TURN_MINUTES")"
    fi
  fi

  turn_file="$session_dir/turn-$(printf '%03d' "$iter").log"
  print_and_log "outer_turn=$iter tool=$TOOL mode=$mode time_left_seconds=$time_left"

  rc=0
  case "$TOOL" in
    claude)
      run_turn_claude "$mode" "$prompt" "$turn_file" || rc=$?
      ;;
    codex)
      run_turn_codex "$mode" "$prompt" "$turn_file" || rc=$?
      ;;
    opencode)
      run_turn_opencode "$mode" "$prompt" "$turn_file" || rc=$?
      ;;
  esac

  if [[ "$rc" -ne 0 && "$iter" -eq 1 && "$mode" = "resume" && "$RESUME" -eq 1 && "$did_resume_fallback" -eq 0 ]]; then
    if [[ -n "$MISSION" ]]; then
      print_and_log "Initial resume failed; falling back to starting a new session."
      RESUME=0
      did_resume_fallback=1
      iter=0
      sleep 1
      continue
    fi
    print_and_log "Initial resume failed and no mission prompt was provided."
    print_and_log "Re-run with a mission prompt after --, or without --resume."
    exit 1
  fi

  if [[ "$rc" -ne 0 ]]; then
    print_and_log "outer_turn=$iter exit_code=$rc (see $turn_file)"
    sleep 10
  else
    sleep 2
  fi

  if [[ "$did_wrap_up" -eq 1 ]]; then
    break
  fi
done

print_and_log "Done. Logs: $session_dir"
