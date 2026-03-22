#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_CONFIG_FILE="$PROJECT_DIR/.codex/config.toml"
AUTOPILOT_HOOKS_TEMPLATE="$PROJECT_DIR/.codex/autopilot-hooks.json"
LIVE_HOOKS_FILE="$PROJECT_DIR/.codex/hooks.json"
CODEX_LAUNCHER="$PROJECT_DIR/scripts/codex-home-launch.sh"
CODEX_SHELL_HELPERS="$PROJECT_DIR/.codex/codex-shell-helpers.sh"

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
}
trap cleanup EXIT

echo "=== agent-autopilot smoke test ==="

assert_not_contains \
  "repo-local Codex config does not enable codex_hooks by default" \
  "$CODEX_CONFIG_FILE" \
  "codex_hooks = true"
assert_file_exists \
  "autopilot hooks template exists" \
  "$AUTOPILOT_HOOKS_TEMPLATE"
assert_file_exists \
  "repo-local Codex launcher exists" \
  "$CODEX_LAUNCHER"
assert_file_exists \
  "repo-local Codex shell helpers exist" \
  "$CODEX_SHELL_HELPERS"
assert_file_not_exists \
  "ordinary sessions do not see a live repo hooks.json" \
  "$LIVE_HOOKS_FILE"

TEST_LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cmux-agent-autopilot-test-XXXXXX")"

bash "$PROJECT_DIR/scripts/agent-autopilot.sh" \
  --tool codex \
  --cwd "$PROJECT_DIR" \
  --minutes 1 \
  --turn-minutes 1 \
  --wrap-up-minutes 1 \
  --log-dir "$TEST_LOG_DIR" \
  --dry-run \
  -- "verify opt-in hook activation" >/dev/null

TURN_LOG="$(find "$TEST_LOG_DIR" -path '*/turn-001.log' | head -n 1)"
assert "dry-run creates the first turn log" test -n "$TURN_LOG"
assert "Codex autopilot still enables codex_hooks explicitly" grep -F -- "--enable codex_hooks" "$TURN_LOG"
assert "Codex autopilot uses the repo hooks template" grep -F -- "hooks_template: $AUTOPILOT_HOOKS_TEMPLATE" "$TURN_LOG"

echo
echo "Passed: $PASS/$TOTAL"

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
