#!/bin/bash
set -euo pipefail

unset AUTOPILOT_DELAY AUTOPILOT_IDLE_THRESHOLD AUTOPILOT_MAX_TURNS AUTOPILOT_MONITORING_THRESHOLD
unset CMUX_AUTOPILOT_DELAY CMUX_AUTOPILOT_IDLE_THRESHOLD CMUX_AUTOPILOT_MAX_TURNS CMUX_AUTOPILOT_MONITORING_THRESHOLD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK="$SCRIPT_DIR/autopilot-stop.sh"
TEST_SESSION="codex-hook-test-$$"
STOP_FILE="/tmp/codex-test-stop-${TEST_SESSION}"
PASS=0
FAIL=0
CONDITIONAL_WAIT_TEXT="Only if you are blocked on external work and are about to poll status"

cleanup() {
  rm -f "$STOP_FILE"
  rm -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-completed-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-idle-${TEST_SESSION}"
  rm -f "/tmp/codex-autopilot-pid-${TEST_SESSION}"
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

reason_text() {
  jq -r '.reason' <<<"$1"
}

assert_reason_contains() {
  local desc="$1"
  local output="$2"
  local pattern="$3"
  assert "$desc" grep -Fq "$pattern" <<<"$(reason_text "$output")"
}

assert_reason_not_contains() {
  local desc="$1"
  local output="$2"
  local pattern="$3"
  if grep -Fq "$pattern" <<<"$(reason_text "$output")"; then
    echo "  FAIL: $desc"
    FAIL=$((FAIL + 1))
  else
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  fi
}

run_enabled_hook() {
  local input_json="$1"
  shift

  echo "$input_json" | env \
    CMUX_AUTOPILOT_ENABLED=1 \
    AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    "$@" \
    bash "$HOOK"
}

echo "=== Codex autopilot hook smoke test ==="

cleanup
touch "$STOP_FILE"

FIRST_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=20 \
  AUTOPILOT_STOP_FILE="$STOP_FILE")

assert "First stop request blocks for inline wrapup" jq -e '.decision == "block"' <<<"$FIRST_OUTPUT"
assert "Wrapup marker created" test -f "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"
assert "Pid marker created on block" test -f "/tmp/codex-autopilot-pid-${TEST_SESSION}"

SECOND_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=20 \
  AUTOPILOT_STOP_FILE="$STOP_FILE" || true)

assert "Second stop request allows stop" test -z "$SECOND_OUTPUT"
assert "Wrapup marker removed after allow" test ! -f "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"
assert "Pid marker removed after allow" test ! -f "/tmp/codex-autopilot-pid-${TEST_SESSION}"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

MAX_TURN_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=1)

assert "Max turns triggers final wrapup block" jq -e '.decision == "block"' <<<"$MAX_TURN_OUTPUT"
assert "Max-turn wrapup marker created" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

MAX_TURN_ALLOW=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=1 || true)

assert "Follow-up stop after max-turn wrapup allows stop" test -z "$MAX_TURN_ALLOW"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

ALIAS_PRECEDENCE_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  AUTOPILOT_MAX_TURNS=1 \
  CMUX_AUTOPILOT_MAX_TURNS=20)

assert "Generic AUTOPILOT_MAX_TURNS overrides CMUX_AUTOPILOT_MAX_TURNS" jq -e '.decision == "block"' <<<"$ALIAS_PRECEDENCE_OUTPUT"
assert "Generic alias max-turn wrapup marker created" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

cleanup
echo "0" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

LEGACY_CLAUDE_ALIAS_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\"}" \
  CLAUDE_AUTOPILOT_MAX_TURNS=1)

assert "Legacy CLAUDE_AUTOPILOT_MAX_TURNS still works for Codex when enabled" jq -e '.decision == "block"' <<<"$LEGACY_CLAUDE_ALIAS_OUTPUT"
assert "Legacy CLAUDE alias creates max-turn wrapup marker" grep -q "max-turns" "/tmp/codex-autopilot-wrapup-${TEST_SESSION}"

cleanup

# Pre-seed turn count to 1 to simulate a repeated Stop event on the same session
echo "1" > "/tmp/codex-autopilot-turns-${TEST_SESSION}"

STOP_ACTIVE_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\",\"stop_hook_active\":true}" \
  AUTOPILOT_MAX_TURNS=99999)

assert "Codex repeated stop with stop_hook_active=true still blocks" jq -e '.decision == "block"' <<<"$STOP_ACTIVE_OUTPUT"
assert "Repeated codex stop recreates blocked flag" test -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"
assert "Repeated codex stop increments turn counter to 2" grep -q '^2$' "/tmp/codex-autopilot-turns-${TEST_SESSION}"

cleanup

# Test stop_hook_active=true on turn 1 should also block
STOP_ACTIVE_TURN1_OUTPUT=$(run_enabled_hook \
  "{\"session_id\":\"${TEST_SESSION}\",\"stop_hook_active\":true}" \
  AUTOPILOT_MAX_TURNS=99999)

assert "Codex stop_hook_active=true on turn 1 still blocks" jq -e '.decision == "block"' <<<"$STOP_ACTIVE_TURN1_OUTPUT"

cleanup

DISABLED_BY_DEFAULT_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  env -u AUTOPILOT_KEEP_RUNNING_DISABLED -u CMUX_AUTOPILOT_ENABLED \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    bash "$HOOK" || true)

assert "Unset AUTOPILOT_KEEP_RUNNING_DISABLED disables Codex autopilot" test -z "$DISABLED_BY_DEFAULT_OUTPUT"
assert "Disabled-by-default run does not create blocked flag" test ! -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"

STALE_LOGIN_ENV_OUTPUT=$(echo "{\"session_id\":\"${TEST_SESSION}\"}" | \
  env -u CMUX_AUTOPILOT_ENABLED \
    AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
    AUTOPILOT_ENABLED=1 \
    AUTOPILOT_DELAY=0 \
    bash "$HOOK" || true)

assert "Stale generic AUTOPILOT_KEEP_RUNNING_DISABLED=0 does not enable Codex autopilot without CMUX_AUTOPILOT_ENABLED=1" test -z "$STALE_LOGIN_ENV_OUTPUT"
assert "Stale generic enable does not create blocked flag" test ! -f "/tmp/codex-autopilot-blocked-${TEST_SESSION}"

cleanup
INPUT_JSON="{\"session_id\":\"${TEST_SESSION}\",\"stop_hook_active\":false}"

WORK_PHASE_OUTPUT=$(run_enabled_hook \
  "$INPUT_JSON" \
  AUTOPILOT_MAX_TURNS=30 \
  AUTOPILOT_MONITORING_THRESHOLD=3 \
  AUTOPILOT_IDLE_THRESHOLD=999)

assert_reason_not_contains "Codex turn 1 work phase has no wait instruction" "$WORK_PHASE_OUTPUT" "sleep"

run_enabled_hook \
  "$INPUT_JSON" \
  AUTOPILOT_MAX_TURNS=30 \
  AUTOPILOT_MONITORING_THRESHOLD=3 \
  AUTOPILOT_IDLE_THRESHOLD=999 >/dev/null
run_enabled_hook \
  "$INPUT_JSON" \
  AUTOPILOT_MAX_TURNS=30 \
  AUTOPILOT_MONITORING_THRESHOLD=3 \
  AUTOPILOT_IDLE_THRESHOLD=999 >/dev/null

PHASE1_OUTPUT=$(run_enabled_hook \
  "$INPUT_JSON" \
  AUTOPILOT_MAX_TURNS=30 \
  AUTOPILOT_MONITORING_THRESHOLD=3 \
  AUTOPILOT_IDLE_THRESHOLD=999)

assert_reason_contains "Codex monitoring phase 1 includes sleep 30" "$PHASE1_OUTPUT" "sleep 30"
assert_reason_contains "Codex monitoring phase 1 wait guidance is conditional" "$PHASE1_OUTPUT" "$CONDITIONAL_WAIT_TEXT"

for _turn in 5 6 7 8; do
  run_enabled_hook \
    "$INPUT_JSON" \
    AUTOPILOT_MAX_TURNS=30 \
    AUTOPILOT_MONITORING_THRESHOLD=3 \
    AUTOPILOT_IDLE_THRESHOLD=999 >/dev/null
done

PHASE2_OUTPUT=$(run_enabled_hook \
  "$INPUT_JSON" \
  AUTOPILOT_MAX_TURNS=30 \
  AUTOPILOT_MONITORING_THRESHOLD=3 \
  AUTOPILOT_IDLE_THRESHOLD=999)

assert_reason_contains "Codex monitoring phase 2 includes sleep 60" "$PHASE2_OUTPUT" "sleep 60"
assert_reason_contains "Codex monitoring phase 2 wait guidance is conditional" "$PHASE2_OUTPUT" "$CONDITIONAL_WAIT_TEXT"

echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
