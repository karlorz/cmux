#!/bin/bash
# Shared test utilities for autopilot E2E tests.
#
# Source this file from test scripts:
#   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
#   source "$SCRIPT_DIR/lib/autopilot-test-helpers.sh"
#
# Provides:
#   - Assertion helpers: assert_eq, assert_contains, assert_not_empty
#   - Prerequisites: check_prerequisites
#   - Task lifecycle: create_autopilot_task, poll_until_terminal, get_task_runs_json
#   - JSON helpers: extract_json_field
#   - Cleanup: register_task_cleanup, cleanup_tasks

# --- Counters ---
_ATH_PASS=0
_ATH_FAIL=0
_ATH_TOTAL=0

# --- Colors ---
_ATH_RED='\033[0;31m'
_ATH_GREEN='\033[0;32m'
_ATH_NC='\033[0m'

# --- Created tasks for cleanup ---
_ATH_CREATED_TASKS=()

# ============================================================================
# Assertion helpers
# ============================================================================

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  _ATH_TOTAL=$((_ATH_TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${_ATH_GREEN}PASS${_ATH_NC}: $desc (got: $actual)"
    _ATH_PASS=$((_ATH_PASS + 1))
  else
    echo -e "  ${_ATH_RED}FAIL${_ATH_NC}: $desc (expected: $expected, got: $actual)"
    _ATH_FAIL=$((_ATH_FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  _ATH_TOTAL=$((_ATH_TOTAL + 1))
  if echo "$haystack" | grep -q "$needle" 2>/dev/null; then
    echo -e "  ${_ATH_GREEN}PASS${_ATH_NC}: $desc (contains: $needle)"
    _ATH_PASS=$((_ATH_PASS + 1))
  else
    echo -e "  ${_ATH_RED}FAIL${_ATH_NC}: $desc (missing: $needle)"
    _ATH_FAIL=$((_ATH_FAIL + 1))
  fi
}

assert_not_empty() {
  local desc="$1" value="$2"
  _ATH_TOTAL=$((_ATH_TOTAL + 1))
  if [ -n "$value" ]; then
    echo -e "  ${_ATH_GREEN}PASS${_ATH_NC}: $desc (non-empty)"
    _ATH_PASS=$((_ATH_PASS + 1))
  else
    echo -e "  ${_ATH_RED}FAIL${_ATH_NC}: $desc (empty)"
    _ATH_FAIL=$((_ATH_FAIL + 1))
  fi
}

assert_file_exists() {
  local desc="$1" path="$2"
  _ATH_TOTAL=$((_ATH_TOTAL + 1))
  if [ -f "$path" ]; then
    echo -e "  ${_ATH_GREEN}PASS${_ATH_NC}: $desc (file exists)"
    _ATH_PASS=$((_ATH_PASS + 1))
  else
    echo -e "  ${_ATH_RED}FAIL${_ATH_NC}: $desc (file missing: $path)"
    _ATH_FAIL=$((_ATH_FAIL + 1))
  fi
}

assert_file_not_exists() {
  local desc="$1" path="$2"
  _ATH_TOTAL=$((_ATH_TOTAL + 1))
  if [ ! -f "$path" ]; then
    echo -e "  ${_ATH_GREEN}PASS${_ATH_NC}: $desc (file absent)"
    _ATH_PASS=$((_ATH_PASS + 1))
  else
    echo -e "  ${_ATH_RED}FAIL${_ATH_NC}: $desc (file should not exist: $path)"
    _ATH_FAIL=$((_ATH_FAIL + 1))
  fi
}

# Print test summary and exit with appropriate code.
print_summary() {
  echo ""
  echo "============================================"
  if [ "$_ATH_FAIL" -eq 0 ]; then
    echo -e "${_ATH_GREEN}All $_ATH_TOTAL assertions passed ($_ATH_PASS/$_ATH_TOTAL)${_ATH_NC}"
  else
    echo -e "${_ATH_RED}$_ATH_FAIL/$_ATH_TOTAL assertions failed${_ATH_NC} ($_ATH_PASS passed)"
  fi
  echo "============================================"
  exit "$_ATH_FAIL"
}

# ============================================================================
# Prerequisites
# ============================================================================

check_prerequisites() {
  if ! command -v devsh &> /dev/null; then
    echo "[SETUP] devsh not found, building..."
    make install-devsh-dev
  fi

  if [ -z "${CMUX_AUTH_TOKEN:-}" ]; then
    echo "[ERROR] CMUX_AUTH_TOKEN not set"
    echo "Run: CMUX_AUTH_TOKEN=\$(cloudrouter auth token) $0"
    exit 1
  fi
}

# ============================================================================
# Task lifecycle
# ============================================================================

# Create an autopilot task. Prints the task ID to stdout.
# Usage: TASK_ID=$(create_autopilot_task --repo <repo> --agent <agent> --autopilot-minutes <min> "<prompt>")
create_autopilot_task() {
  local output
  output=$(devsh task create --autopilot --json "$@" 2>&1 || true)

  local task_id
  task_id=$(extract_task_id "$output")

  if [ -z "$task_id" ]; then
    echo "[ERROR] Failed to extract task ID from output:" >&2
    echo "$output" >&2
    return 1
  fi

  # Register for cleanup
  _ATH_CREATED_TASKS+=("$task_id")

  echo "$task_id"
}

# Poll task status until terminal state. Prints final status to stdout.
# Args: <task_id> [timeout_seconds] [poll_interval_seconds]
poll_until_terminal() {
  local task_id="$1"
  local timeout="${2:-300}"
  local interval="${3:-10}"
  local start_time last_status current_status elapsed status_output

  start_time=$(date +%s)
  last_status=""

  while true; do
    status_output=$(devsh task status "$task_id" --json 2>&1 || echo "{}")
    current_status=$(echo "$status_output" | grep -oP '"status":\s*"\K[^"]+' | head -1 || echo "unknown")

    if [ "$current_status" != "$last_status" ]; then
      elapsed=$(( $(date +%s) - start_time ))
      echo "  [${elapsed}s] Status: $current_status" >&2
      last_status="$current_status"
    fi

    if echo "$current_status" | grep -qiE "^(completed|stopped|failed|archived)$"; then
      echo "$current_status"
      return 0
    fi

    elapsed=$(( $(date +%s) - start_time ))
    if [ "$elapsed" -ge "$timeout" ]; then
      echo "  [TIMEOUT] after ${timeout}s" >&2
      echo "$current_status"
      return 1
    fi

    sleep "$interval"
  done
}

# Get task runs as JSON. Prints JSON to stdout.
get_task_runs_json() {
  local task_id="$1"
  devsh task runs "$task_id" --json 2>&1 || echo "[]"
}

# ============================================================================
# JSON helpers
# ============================================================================

# Extract a field from JSON string. Usage: extract_json_field "$json" "fieldName"
extract_json_field() {
  local json="$1" field="$2"
  echo "$json" | grep -oP "\"${field}\":\s*\"\K[^\"]*" | head -1 || echo ""
}

# Extract a numeric field from JSON string.
extract_json_number() {
  local json="$1" field="$2"
  echo "$json" | grep -oP "\"${field}\":\s*\K[0-9]+" | head -1 || echo ""
}

# Extract a boolean field from JSON string.
extract_json_bool() {
  local json="$1" field="$2"
  echo "$json" | grep -oP "\"${field}\":\s*\K(true|false)" | head -1 || echo ""
}

# Extract task ID from devsh task create output (JSON or plain text).
extract_task_id() {
  local output="$1"
  local task_id
  task_id=$(echo "$output" | grep -oP '"taskId":\s*"\K[^"]+' || echo "")
  if [ -z "$task_id" ]; then
    task_id=$(echo "$output" | grep -oP 'Task ID:\s*\K\S+' || echo "")
  fi
  echo "$task_id"
}

# ============================================================================
# Cleanup
# ============================================================================

# Register EXIT trap to clean up all created tasks.
register_task_cleanup() {
  trap '_cleanup_all_tasks' EXIT
}

_cleanup_all_tasks() {
  if [ ${#_ATH_CREATED_TASKS[@]} -gt 0 ]; then
    echo ""
    echo "[CLEANUP] Stopping ${#_ATH_CREATED_TASKS[@]} task(s)..."
    for tid in "${_ATH_CREATED_TASKS[@]}"; do
      devsh task stop "$tid" 2>/dev/null || true
    done
  fi
}
