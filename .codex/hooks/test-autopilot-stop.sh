#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$SCRIPT_DIR/autopilot-stop.sh"
TEST_SESSION="codex-hook-test-$$"
STOP_FILE="/tmp/codex-test-stop-${TEST_SESSION}"
PASS=0
FAIL=0

cleanup() {
  rm -f "$STOP_FILE"
  rm -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-completed-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-idle-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-state-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-stop-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-turns-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"
}
trap cleanup EXIT

assert() {
  local desc="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Codex autopilot hook smoke test ==="

cleanup
touch "$STOP_FILE"

FIRST_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  AUTOPILOT_ENABLED=1 \
  AUTOPILOT_MAX_TURNS=20 \
  AUTOPILOT_DELAY=0 \
  AUTOPILOT_STOP_FILE="$STOP_FILE" \
  bash "$HOOK")

assert "First stop request blocks for inline wrapup" jq -e '.decision == "block"' <<<"$FIRST_OUTPUT"
assert "Wrapup marker created" test -f "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

SECOND_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  AUTOPILOT_ENABLED=1 \
  AUTOPILOT_MAX_TURNS=20 \
  AUTOPILOT_DELAY=0 \
  AUTOPILOT_STOP_FILE="$STOP_FILE" \
  bash "$HOOK" || true)

assert "Second stop request allows stop" test -z "$SECOND_OUTPUT"
assert "Wrapup marker removed after allow" test ! -f "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

MAX_TURN_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  AUTOPILOT_ENABLED=1 \
  AUTOPILOT_MAX_TURNS=1 \
  AUTOPILOT_DELAY=0 \
  bash "$HOOK")

assert "Max turns triggers final wrapup block" jq -e '.decision == "block"' <<<"$MAX_TURN_OUTPUT"
assert "Max-turn wrapup marker created" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

MAX_TURN_ALLOW=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  AUTOPILOT_ENABLED=1 \
  AUTOPILOT_MAX_TURNS=1 \
  AUTOPILOT_DELAY=0 \
  bash "$HOOK" || true)

assert "Follow-up stop after max-turn wrapup allows stop" test -z "$MAX_TURN_ALLOW"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

ALIAS_PRECEDENCE_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  AUTOPILOT_ENABLED=1 \
  AUTOPILOT_MAX_TURNS=1 \
  AUTOPILOT_DELAY=0 \
  CMUX_AUTOPILOT_MAX_TURNS=20 \
  bash "$HOOK")

assert "Generic AUTOPILOT_MAX_TURNS overrides CMUX_AUTOPILOT_MAX_TURNS" jq -e '.decision == "block"' <<<"$ALIAS_PRECEDENCE_OUTPUT"
assert "Generic alias max-turn wrapup marker created" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

LEGACY_CLAUDE_ALIAS_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  AUTOPILOT_ENABLED=1 \
  AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_MAX_TURNS=1 \
  bash "$HOOK")

assert "Legacy CLAUDE_AUTOPILOT_MAX_TURNS still works for Codex when enabled" jq -e '.decision == "block"' <<<"$LEGACY_CLAUDE_ALIAS_OUTPUT"
assert "Legacy CLAUDE alias creates max-turn wrapup marker" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

cleanup

DISABLED_BY_DEFAULT_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  env -u AUTOPILOT_KEEP_RUNNING_DISABLED \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    bash "$HOOK" || true)

assert "Unset AUTOPILOT_KEEP_RUNNING_DISABLED disables Codex autopilot" test -z "$DISABLED_BY_DEFAULT_OUTPUT"
assert "Disabled-by-default run does not create blocked flag" test ! -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
