#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_CONFIG_FILE="$PROJECT_DIR/.codex/config.toml"
LIVE_HOOKS_FILE="$PROJECT_DIR/.codex/hooks.json"
CODEX_HOME_INSTALLER="$PROJECT_DIR/scripts/install-codex-home-hooks.sh"
CODEX_STOP_DISPATCH="$PROJECT_DIR/.codex/hooks/cmux-stop-dispatch.sh"
LEGACY_AUTOPILOT_TEMPLATE="$PROJECT_DIR/.codex/autopilot-hooks.json"
LEGACY_RALPH_TEMPLATE="$PROJECT_DIR/.codex/ralph-loop-hooks.json"
LEGACY_CODEX_LAUNCHER="$PROJECT_DIR/scripts/codex-home-launch.sh"
LEGACY_CODEX_SHELL_HELPERS="$PROJECT_DIR/.codex/codex-shell-helpers.sh"

PASS=0
FAIL=0
TOTAL=0

assert() {
  local desc="$1"
  shift
  TOTAL=$((TOTAL + 1))
  if "$@" >/dev/null 2>&1; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc="$1"
  local file="$2"
  local pattern="$3"
  TOTAL=$((TOTAL + 1))
  if grep -Fq -- "$pattern" "$file"; then
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  fi
}

assert_file_exists() {
  local desc="$1"
  local path="$2"
  TOTAL=$((TOTAL + 1))
  if [[ -f "$path" ]]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_not_exists() {
  local desc="$1"
  local path="$2"
  TOTAL=$((TOTAL + 1))
  if [[ ! -e "$path" ]]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

cleanup() {
  if [[ -n "${TEST_LOG_DIR:-}" && -d "${TEST_LOG_DIR:-}" ]]; then
    rm -rf "$TEST_LOG_DIR"
  fi
  if [[ -n "${TARGET_WORKSPACE:-}" && -d "${TARGET_WORKSPACE:-}" ]]; then
    rm -rf "$TARGET_WORKSPACE"
  fi
}
trap cleanup EXIT

echo "=== agent-autopilot smoke test ==="

assert_not_contains \
  "repo-local Codex config does not enable codex_hooks by default" \
  "$CODEX_CONFIG_FILE" \
  "codex_hooks = true"
assert_file_exists \
  "Codex home hook installer exists" \
  "$CODEX_HOME_INSTALLER"
assert_file_exists \
  "managed stop dispatcher exists" \
  "$CODEX_STOP_DISPATCH"
assert_file_not_exists \
  "legacy autopilot hooks template has been removed" \
  "$LEGACY_AUTOPILOT_TEMPLATE"
assert_file_not_exists \
  "legacy Ralph hooks template has been removed" \
  "$LEGACY_RALPH_TEMPLATE"
assert_file_not_exists \
  "legacy Codex launcher has been removed" \
  "$LEGACY_CODEX_LAUNCHER"
assert_file_not_exists \
  "legacy Codex shell helpers have been removed" \
  "$LEGACY_CODEX_SHELL_HELPERS"
assert_file_not_exists \
  "ordinary sessions do not see a live repo hooks.json" \
  "$LIVE_HOOKS_FILE"

TEST_LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cmux-agent-autopilot-test-XXXXXX")"
TARGET_WORKSPACE="$(mktemp -d "${TMPDIR:-/tmp}/cmux-agent-autopilot-target-XXXXXX")"
TARGET_WORKSPACE_ROOT="$(cd "$TARGET_WORKSPACE" && pwd)"

bash "$PROJECT_DIR/scripts/agent-autopilot.sh" \
  --tool codex \
  --cwd "$TARGET_WORKSPACE" \
  --minutes 1 \
  --turn-minutes 1 \
  --wrap-up-minutes 1 \
  --log-dir "$TEST_LOG_DIR" \
  --dry-run \
  -- "verify opt-in hook activation" >/dev/null

TURN_LOG="$(find "$TEST_LOG_DIR" -path '*/turn-001.log' | head -n 1)"
assert "dry-run creates the first turn log" test -n "$TURN_LOG"
assert "Codex autopilot records managed home hooks in the turn log" grep -F -- "home_hooks: managed" "$TURN_LOG"
assert "Codex autopilot records repo override routing in the turn log" grep -F -- "home_hook_routing: workspace_override_then_home_fallback" "$TURN_LOG"
assert "Codex autopilot records the installer path" grep -F -- "hooks_installer: $CODEX_HOME_INSTALLER" "$TURN_LOG"
assert "Codex autopilot can target an arbitrary workspace" grep -F -- "cwd: $TARGET_WORKSPACE_ROOT" "$TURN_LOG"
assert_not_contains \
  "Codex autopilot no longer relies on repo-local hook templates" \
  "$TURN_LOG" \
  "hooks_template:"
assert_not_contains \
  "Codex autopilot no longer passes the legacy codex_hooks flag" \
  "$TURN_LOG" \
  "--enable codex_hooks"

echo
echo "Passed: $PASS/$TOTAL"

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
