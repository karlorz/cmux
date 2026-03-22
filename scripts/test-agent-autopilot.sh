#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_CONFIG_FILE="$PROJECT_DIR/.codex/config.toml"

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

echo
echo "Passed: $PASS/$TOTAL"

if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi
