#!/bin/bash
# Runs official Codex review in the background and shows results on the next stop.
# This keeps the stop hook non-blocking while still enforcing review before the
# session can finish when findings or review failures are present.

set -euo pipefail

# Debug logging is opt-in via CODEX_REVIEW_DEBUG=1
DEBUG_ENABLED="${CODEX_REVIEW_DEBUG:-0}"
debug_log() {
  if [ "$DEBUG_ENABLED" = "1" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "/tmp/codex-review-debug.log"
  fi
}

scope_label() {
  case "$1" in
    base)
      printf '%s' "committed changes"
      ;;
    uncommitted)
      printf '%s' "uncommitted changes"
      ;;
    *)
      printf '%s' "$1"
      ;;
  esac
}

read_counter_file() {
  local file_path="$1"
  if [ -f "$file_path" ]; then
    cat "$file_path"
  else
    echo "0"
  fi
}

scope_files() {
  case "$1" in
    base)
      SCOPE_REVIEWED_FILE="$REVIEWED_BASE_FILE"
      SCOPE_RESULT_FILE="$RESULT_BASE_FILE"
      SCOPE_RESULT_TYPE_FILE="$RESULT_TYPE_BASE_FILE"
      SCOPE_BG_PID_FILE="$BG_PID_BASE_FILE"
      SCOPE_BG_STATE_FILE="$BG_STATE_BASE_FILE"
      ;;
    uncommitted)
      SCOPE_REVIEWED_FILE="$REVIEWED_UNCOMMITTED_FILE"
      SCOPE_RESULT_FILE="$RESULT_UNCOMMITTED_FILE"
      SCOPE_RESULT_TYPE_FILE="$RESULT_TYPE_UNCOMMITTED_FILE"
      SCOPE_BG_PID_FILE="$BG_PID_UNCOMMITTED_FILE"
      SCOPE_BG_STATE_FILE="$BG_STATE_UNCOMMITTED_FILE"
      ;;
    *)
      echo "Unknown review scope: $1" >&2
      exit 1
      ;;
  esac
}

stop_background_review() {
  local scope="$1"
  scope_files "$scope"

  if [ -f "$SCOPE_BG_PID_FILE" ]; then
    local old_pid
    old_pid=$(cat "$SCOPE_BG_PID_FILE")
    debug_log "Killing ${scope} background review (pid $old_pid)"
    pkill -P "$old_pid" 2>/dev/null || true
    kill "$old_pid" 2>/dev/null || true
  fi

  rm -f "$SCOPE_BG_PID_FILE" "$SCOPE_BG_STATE_FILE"
}

scope_running_for_state() {
  local scope="$1"
  local expected_state="$2"
  scope_files "$scope"

  if [ -f "$SCOPE_BG_PID_FILE" ] && [ -f "$SCOPE_BG_STATE_FILE" ]; then
    local bg_pid
    local bg_state
    bg_pid=$(cat "$SCOPE_BG_PID_FILE")
    bg_state=$(cat "$SCOPE_BG_STATE_FILE")
    if [ "$bg_state" = "$expected_state" ] && kill -0 "$bg_pid" 2>/dev/null; then
      return 0
    fi
  fi

  return 1
}

process_completed_review() {
  local scope="$1"
  local expected_state="$2"
  local label
  local prev_state
  local findings
  local result_type

  scope_files "$scope"
  [ -f "$SCOPE_RESULT_FILE" ] || return 0

  label=$(scope_label "$scope")
  prev_state=$(cat "$SCOPE_BG_STATE_FILE" 2>/dev/null || echo "")
  findings=$(cat "$SCOPE_RESULT_FILE")
  result_type=$(cat "$SCOPE_RESULT_TYPE_FILE" 2>/dev/null || echo "findings")
  rm -f "$SCOPE_RESULT_FILE" "$SCOPE_RESULT_TYPE_FILE" "$SCOPE_BG_PID_FILE" "$SCOPE_BG_STATE_FILE"

  if [ "$prev_state" != "$expected_state" ]; then
    debug_log "Discarding stale ${scope} results for $prev_state (current: $expected_state)"
    return 0
  fi

  if [ -z "$findings" ] && [ "$result_type" != "findings" ]; then
    return 0
  fi

  debug_log "Found background ${scope} review results for state: $prev_state (type: $result_type)"

  if [ "$result_type" = "transport_failure" ]; then
    TRANSPORT_FAILURE_SECTIONS+=("## Codex Review Transport Failure (${label})

${findings}

---
Codex review could not complete due to transport/connectivity issues. This is NOT a code review finding.")
    return 0
  fi

  SUCCESSFUL_REVIEW_RESULT="1"
  echo "$prev_state" > "$SCOPE_REVIEWED_FILE"

  if [ -z "$findings" ]; then
    debug_log "Background ${scope} review PASSED (no findings)"
    return 0
  fi

  debug_log "Background ${scope} review has ISSUES"
  ISSUE_SECTIONS+=("### ${label}

${findings}")
}

start_background_review() {
  local scope="$1"
  local state="$2"
  local label
  label=$(scope_label "$scope")
  scope_files "$scope"

  debug_log "Starting background ${scope} codex review for state $state"
  stop_background_review "$scope"

  EXTRACTOR_SCRIPT="$CLAUDE_PROJECT_DIR/.claude/scripts/codex-review-extract.sh"
  (
    TMPFILE=$(mktemp)
    trap 'rm -f "$TMPFILE"' EXIT

    EXTRACTOR_EXIT=0
    if [ "$scope" = "base" ]; then
      CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" "$EXTRACTOR_SCRIPT" --base main > "$TMPFILE" 2>&1 || EXTRACTOR_EXIT=$?
    else
      CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" "$EXTRACTOR_SCRIPT" --uncommitted > "$TMPFILE" 2>&1 || EXTRACTOR_EXIT=$?
    fi

    FINDINGS=$(cat "$TMPFILE")
    echo "$FINDINGS" > "$SCOPE_RESULT_FILE"

    if [ "$EXTRACTOR_EXIT" -ne 0 ]; then
      echo "transport_failure" > "$SCOPE_RESULT_TYPE_FILE"
    else
      echo "findings" > "$SCOPE_RESULT_TYPE_FILE"
    fi

    rm -f "$SCOPE_BG_PID_FILE"
  ) &

  BG_PID=$!
  echo "$BG_PID" > "$SCOPE_BG_PID_FILE"
  echo "$state" > "$SCOPE_BG_STATE_FILE"
  debug_log "Background ${label} review started (pid $BG_PID)"
}

debug_log "=== codex-review.sh START ==="
debug_log "CODEX_REVIEW_DISABLED=${CODEX_REVIEW_DISABLED:-}"
debug_log "CLAUDE_AUTOPILOT=${CLAUDE_AUTOPILOT:-}"

# Skip if disabled via env var
if [ "${CODEX_REVIEW_DISABLED:-}" = "1" ]; then
  debug_log "Exiting: CODEX_REVIEW_DISABLED=1"
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Read session_id from hook stdin JSON
INPUT=$(cat)
debug_log "INPUT JSON: $INPUT"

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
SESSION_ID="${SESSION_ID:-default}"
debug_log "SESSION_ID: $SESSION_ID"

# Session-scoped file paths
REVIEWED_BASE_FILE="/tmp/codex-review-reviewed-base-${SESSION_ID}"
REVIEWED_UNCOMMITTED_FILE="/tmp/codex-review-reviewed-uncommitted-${SESSION_ID}"
RESULT_BASE_FILE="/tmp/codex-review-result-base-${SESSION_ID}"
RESULT_UNCOMMITTED_FILE="/tmp/codex-review-result-uncommitted-${SESSION_ID}"
RESULT_TYPE_BASE_FILE="/tmp/codex-review-result-type-base-${SESSION_ID}"
RESULT_TYPE_UNCOMMITTED_FILE="/tmp/codex-review-result-type-uncommitted-${SESSION_ID}"
BG_PID_BASE_FILE="/tmp/codex-review-pid-base-${SESSION_ID}"
BG_PID_UNCOMMITTED_FILE="/tmp/codex-review-pid-uncommitted-${SESSION_ID}"
BG_STATE_BASE_FILE="/tmp/codex-review-bg-state-base-${SESSION_ID}"
BG_STATE_UNCOMMITTED_FILE="/tmp/codex-review-bg-state-uncommitted-${SESSION_ID}"
FAIL_COUNT_FILE="/tmp/codex-review-fails-${SESSION_ID}"
TRANSPORT_FAIL_FILE="/tmp/codex-review-transport-fails-${SESSION_ID}"
TRANSPORT_COOLDOWN_FILE="/tmp/codex-review-transport-cooldown-${SESSION_ID}"
AUTOPILOT_BLOCKED_FILE="/tmp/claude-autopilot-blocked-${SESSION_ID}"
COMPLETED_FILE="/tmp/claude-autopilot-completed-${SESSION_ID}"

# Cooldown settings
TRANSPORT_FAIL_THRESHOLD="${CODEX_REVIEW_TRANSPORT_FAIL_THRESHOLD:-3}"
TRANSPORT_COOLDOWN_SECONDS="${CODEX_REVIEW_TRANSPORT_COOLDOWN_SECONDS:-300}"

# Clean up completed marker on exit
trap 'rm -f "$COMPLETED_FILE"' EXIT

# Autopilot is only active when Claude set it for this run and it was
# explicitly enabled via AUTOPILOT_KEEP_RUNNING_DISABLED=0.
AUTOPILOT_ACTIVE="0"
if [ "${CLAUDE_AUTOPILOT:-0}" = "1" ] && [ "${AUTOPILOT_KEEP_RUNNING_DISABLED:-1}" = "0" ]; then
  AUTOPILOT_ACTIVE="1"
fi
debug_log "AUTOPILOT_ACTIVE: $AUTOPILOT_ACTIVE, AUTOPILOT_BLOCKED_FILE exists: $([ -f "$AUTOPILOT_BLOCKED_FILE" ] && echo 'true' || echo 'false')"

# Skip if autopilot specifically blocked this stop
if [ "$AUTOPILOT_ACTIVE" = "1" ] && [ -f "$AUTOPILOT_BLOCKED_FILE" ]; then
  debug_log "Exiting: autopilot blocked this stop (flag file exists)"
  exit 0
fi

# Clean up stale flag file if autopilot is not active
if [ "$AUTOPILOT_ACTIVE" != "1" ] && [ -f "$AUTOPILOT_BLOCKED_FILE" ]; then
  rm -f "$AUTOPILOT_BLOCKED_FILE"
  debug_log "Cleaned up stale autopilot blocked flag"
fi

# --- Compute current state fingerprints FIRST ---
CURRENT_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
MAIN_BASE=$(git merge-base main HEAD 2>/dev/null || echo "unknown")
HAS_UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -q . && echo "1" || echo "0")

# For dirty tree, include hash of both unstaged AND staged changes.
if [ "$HAS_UNCOMMITTED" = "1" ]; then
  DIRTY_HASH=$({ git diff 2>/dev/null; git diff --cached 2>/dev/null; } | shasum -a 256 | cut -c1-16)
else
  DIRTY_HASH="clean"
fi

BASE_STATE_FINGERPRINT="${MAIN_BASE}:${CURRENT_HEAD}"
UNCOMMITTED_STATE_FINGERPRINT="${CURRENT_HEAD}:${DIRTY_HASH}"
debug_log "Base state fingerprint: $BASE_STATE_FINGERPRINT"
debug_log "Uncommitted state fingerprint: $UNCOMMITTED_STATE_FINGERPRINT"

# --- Check for completed background review results ---
declare -a TRANSPORT_FAILURE_SECTIONS=()
declare -a ISSUE_SECTIONS=()
SUCCESSFUL_REVIEW_RESULT="0"

process_completed_review base "$BASE_STATE_FINGERPRINT"
process_completed_review uncommitted "$UNCOMMITTED_STATE_FINGERPRINT"

if [ "${#TRANSPORT_FAILURE_SECTIONS[@]}" -gt 0 ]; then
  debug_log "Background review had transport failure"

  TRANSPORT_FAILS=$(read_counter_file "$TRANSPORT_FAIL_FILE")
  TRANSPORT_FAILS=$((TRANSPORT_FAILS + 1))
  echo "$TRANSPORT_FAILS" > "$TRANSPORT_FAIL_FILE"
  debug_log "Consecutive transport failures: $TRANSPORT_FAILS"

  if [ "$TRANSPORT_FAILS" -ge "$TRANSPORT_FAIL_THRESHOLD" ]; then
    COOLDOWN_UNTIL=$(($(date +%s) + TRANSPORT_COOLDOWN_SECONDS))
    echo "$COOLDOWN_UNTIL" > "$TRANSPORT_COOLDOWN_FILE"
    debug_log "Transport failure threshold reached ($TRANSPORT_FAILS >= $TRANSPORT_FAIL_THRESHOLD), cooldown until $(date -d "@$COOLDOWN_UNTIL" 2>/dev/null || echo "$COOLDOWN_UNTIL")"
  fi

  TRANSPORT_OUTPUT=""
  for section in "${TRANSPORT_FAILURE_SECTIONS[@]}"; do
    if [ -n "$TRANSPORT_OUTPUT" ]; then
      TRANSPORT_OUTPUT="${TRANSPORT_OUTPUT}

"
    fi
    TRANSPORT_OUTPUT="${TRANSPORT_OUTPUT}${section}"
  done

  printf '%s\n' "$TRANSPORT_OUTPUT" >&2
  exit 2
fi

if [ "$SUCCESSFUL_REVIEW_RESULT" = "1" ]; then
  rm -f "$TRANSPORT_FAIL_FILE" "$TRANSPORT_COOLDOWN_FILE"
fi

if [ "${#ISSUE_SECTIONS[@]}" -gt 0 ]; then
  FAIL_COUNT=$(read_counter_file "$FAIL_COUNT_FILE")
  if [ "$FAIL_COUNT" -ge 5 ]; then
    debug_log "Hit fail limit, not showing results"
    exit 0
  fi

  NEXT_FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "$NEXT_FAIL_COUNT" > "$FAIL_COUNT_FILE"

  REMAINING_INFO=""
  if [ "$AUTOPILOT_ACTIVE" = "1" ]; then
    TURN_FILE="/tmp/claude-autopilot-turns-${SESSION_ID}"
    if [ -f "$TURN_FILE" ]; then
      CURRENT_TURN=$(cat "$TURN_FILE" 2>/dev/null || echo "0")
      AP_MAX="${AUTOPILOT_MAX_TURNS:-${CMUX_AUTOPILOT_MAX_TURNS:-${CLAUDE_AUTOPILOT_MAX_TURNS:-20}}}"
      REMAINING=$((AP_MAX - CURRENT_TURN))
      if [ "$REMAINING" -gt 0 ]; then
        REMAINING_INFO=" You have $REMAINING autopilot turns remaining to address these."
      fi
    fi
  fi

  ISSUE_OUTPUT=""
  for section in "${ISSUE_SECTIONS[@]}"; do
    if [ -n "$ISSUE_OUTPUT" ]; then
      ISSUE_OUTPUT="${ISSUE_OUTPUT}

"
    fi
    ISSUE_OUTPUT="${ISSUE_OUTPUT}${section}"
  done

  printf '## Codex Code Review Findings (attempt %s/5)\n\n%s\n\n---\nPlease address the above issues.%s\n' "$NEXT_FAIL_COUNT" "$ISSUE_OUTPUT" "$REMAINING_INFO" >&2
  exit 2
fi

if [ "$SUCCESSFUL_REVIEW_RESULT" = "1" ]; then
  rm -f "$FAIL_COUNT_FILE"
fi

# --- Session-based work detection (fingerprints already computed above) ---
COMMITS_AHEAD=$(git rev-list --count "${MAIN_BASE}..HEAD" 2>/dev/null || echo "0")

if [ "$COMMITS_AHEAD" = "0" ] && [ "$HAS_UNCOMMITTED" = "0" ]; then
  TURN_FILE="/tmp/claude-autopilot-turns-${SESSION_ID}"
  if [ "$AUTOPILOT_ACTIVE" = "1" ] && [ -f "$COMPLETED_FILE" ]; then
    debug_log "Work detected via autopilot completed marker"
  elif [ -f "$TURN_FILE" ]; then
    debug_log "Work detected via turn file"
  else
    debug_log "Skipping: no work vs main"
    stop_background_review base
    stop_background_review uncommitted
    exit 0
  fi
fi

debug_log "Proceeding with codex review..."

# Check transport failure cooldown before starting new review
if [ -f "$TRANSPORT_COOLDOWN_FILE" ]; then
  COOLDOWN_UNTIL=$(cat "$TRANSPORT_COOLDOWN_FILE")
  NOW=$(date +%s)
  if [ "$NOW" -lt "$COOLDOWN_UNTIL" ]; then
    REMAINING=$((COOLDOWN_UNTIL - NOW))
    debug_log "Skipping: transport failure cooldown active (${REMAINING}s remaining)"
    exit 0
  else
    debug_log "Transport failure cooldown expired, resuming reviews"
    rm -f "$TRANSPORT_COOLDOWN_FILE"
  fi
fi

# Dry-run mode
if [ "${CODEX_REVIEW_DRY_RUN:-}" = "1" ]; then
  debug_log "Dry-run mode, exiting"
  exit 0
fi

# Check fail count before starting new review
FAIL_COUNT=$(read_counter_file "$FAIL_COUNT_FILE")
if [ "$FAIL_COUNT" -ge 5 ]; then
  debug_log "Hit fail limit, not starting new review"
  exit 0
fi

# Start committed review for current branch/work session.
if [ -f "$REVIEWED_BASE_FILE" ] && [ "$(cat "$REVIEWED_BASE_FILE")" = "$BASE_STATE_FINGERPRINT" ]; then
  debug_log "Skipping committed review: already reviewed state $BASE_STATE_FINGERPRINT"
elif scope_running_for_state base "$BASE_STATE_FINGERPRINT"; then
  debug_log "Committed background review already running for state $BASE_STATE_FINGERPRINT"
else
  start_background_review base "$BASE_STATE_FINGERPRINT"
fi

# Start uncommitted review only when the working tree is dirty.
if [ "$HAS_UNCOMMITTED" = "1" ]; then
  if [ -f "$REVIEWED_UNCOMMITTED_FILE" ] && [ "$(cat "$REVIEWED_UNCOMMITTED_FILE")" = "$UNCOMMITTED_STATE_FINGERPRINT" ]; then
    debug_log "Skipping uncommitted review: already reviewed state $UNCOMMITTED_STATE_FINGERPRINT"
  elif scope_running_for_state uncommitted "$UNCOMMITTED_STATE_FINGERPRINT"; then
    debug_log "Uncommitted background review already running for state $UNCOMMITTED_STATE_FINGERPRINT"
  else
    start_background_review uncommitted "$UNCOMMITTED_STATE_FINGERPRINT"
  fi
else
  stop_background_review uncommitted
fi

# Exit immediately - don't block the stop hook.
exit 0
