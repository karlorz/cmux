#!/bin/bash
# Local tests for autopilot wrap-up phase, idle detection, and turn limit behavior.
# These test the autopilot-keep-running.sh hook directly without spawning sandboxes.
#
# Usage: ./scripts/test-autopilot-wrap-up.sh
#
# Extends the pattern from test-stop-hooks.sh.

set -euo pipefail

unset AUTOPILOT_DELAY AUTOPILOT_IDLE_THRESHOLD AUTOPILOT_MAX_TURNS AUTOPILOT_MONITORING_THRESHOLD
unset CMUX_AUTOPILOT_DELAY CMUX_AUTOPILOT_IDLE_THRESHOLD CMUX_AUTOPILOT_MAX_TURNS CMUX_AUTOPILOT_MONITORING_THRESHOLD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_DIR/.claude/hooks"
AUTOPILOT_HOOK="$HOOKS_DIR/autopilot-keep-running.sh"

source "$SCRIPT_DIR/lib/autopilot-test-helpers.sh"

echo "=== Autopilot Wrap-Up Phase Tests ==="

cleanup_session() {
  local sid="$1"
  rm -f "/tmp/claude-autopilot-blocked-${sid}"
  rm -f "/tmp/claude-autopilot-completed-${sid}"
  rm -f "/tmp/claude-autopilot-turns-${sid}"
  rm -f "/tmp/claude-autopilot-stop-${sid}"
  rm -f "/tmp/claude-autopilot-state-${sid}"
  rm -f "/tmp/claude-autopilot-idle-${sid}"
}

run_hook() {
  local sid="$1"
  shift
  local input_json='{"session_id":"'"$sid"'","stop_hook_active":false}'
  echo "$input_json" | \
    env \
      CLAUDE_AUTOPILOT=1 \
      CMUX_AUTOPILOT_ENABLED=1 \
      CLAUDE_AUTOPILOT_DELAY=0 \
      CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
      "$@" \
    bash "$AUTOPILOT_HOOK" 2>/dev/null || true
}

# ============================================================================
# Test 1: Stop file triggers immediate allow
# ============================================================================
echo ""
echo "Test 1: Stop file triggers immediate allow"

SID="test-wrapup-1"
cleanup_session "$SID"

# Create stop file
touch "/tmp/claude-autopilot-stop-${SID}"
# Pre-create blocked flag to verify it gets cleaned up
echo "5" > "/tmp/claude-autopilot-blocked-${SID}"

OUTPUT=$(run_hook "$SID" CLAUDE_AUTOPILOT_MAX_TURNS=20)

assert_eq "stop file: no block output" "" "$OUTPUT"
assert_file_not_exists "stop file: blocked flag removed" "/tmp/claude-autopilot-blocked-${SID}"
assert_file_not_exists "stop file: stop file consumed" "/tmp/claude-autopilot-stop-${SID}"

cleanup_session "$SID"

# ============================================================================
# Test 2: Max turns triggers allow + completion marker
# ============================================================================
echo ""
echo "Test 2: Max turns triggers allow + completion marker"

SID="test-wrapup-2"
cleanup_session "$SID"

# Pre-seed turn counter to max-1, so next turn hits max
echo "4" > "/tmp/claude-autopilot-turns-${SID}"
echo "old" > "/tmp/claude-autopilot-blocked-${SID}"

OUTPUT=$(run_hook "$SID" CLAUDE_AUTOPILOT_MAX_TURNS=5)

assert_eq "max turns: no block output" "" "$OUTPUT"
assert_file_exists "max turns: completion marker written" "/tmp/claude-autopilot-completed-${SID}"
assert_file_not_exists "max turns: blocked flag removed" "/tmp/claude-autopilot-blocked-${SID}"
assert_file_not_exists "max turns: turn file removed" "/tmp/claude-autopilot-turns-${SID}"

# Verify completion marker has the turn count
MARKER_CONTENT=$(cat "/tmp/claude-autopilot-completed-${SID}" 2>/dev/null || echo "")
assert_eq "max turns: marker has turn count" "5" "$MARKER_CONTENT"

cleanup_session "$SID"

# ============================================================================
# Test 3: Idle threshold triggers allow after N unchanged turns
# ============================================================================
echo ""
echo "Test 3: Idle threshold triggers allow after 3 unchanged turns"

SID="test-wrapup-3"
cleanup_session "$SID"

# Run the hook 4 times. Git state will be the same each time (we're in the
# same repo and not making changes), so idle detection should fire after
# IDLE_THRESHOLD turns of identical state.
# Turn 1: records initial state (no previous state to compare)
run_hook "$SID" CLAUDE_AUTOPILOT_MAX_TURNS=20 CLAUDE_AUTOPILOT_IDLE_THRESHOLD=3 >/dev/null

# Turns 2-3: state matches, idle count increments to 1, 2
run_hook "$SID" CLAUDE_AUTOPILOT_MAX_TURNS=20 CLAUDE_AUTOPILOT_IDLE_THRESHOLD=3 >/dev/null
run_hook "$SID" CLAUDE_AUTOPILOT_MAX_TURNS=20 CLAUDE_AUTOPILOT_IDLE_THRESHOLD=3 >/dev/null

# Verify idle count at 2 (threshold not yet reached)
IDLE_COUNT=$(cat "/tmp/claude-autopilot-idle-${SID}" 2>/dev/null || echo "0")
assert_eq "idle: count is 2 after 3 turns (2 matches)" "2" "$IDLE_COUNT"
assert_file_exists "idle: blocked flag still set" "/tmp/claude-autopilot-blocked-${SID}"

# Turn 4: idle count reaches 3 = threshold, should allow stop
OUTPUT=$(run_hook "$SID" CLAUDE_AUTOPILOT_MAX_TURNS=20 CLAUDE_AUTOPILOT_IDLE_THRESHOLD=3)

assert_eq "idle: no block output at threshold" "" "$OUTPUT"
assert_file_not_exists "idle: blocked flag removed" "/tmp/claude-autopilot-blocked-${SID}"
assert_file_not_exists "idle: turn file removed" "/tmp/claude-autopilot-turns-${SID}"

cleanup_session "$SID"

# ============================================================================
# Test 4: Review phase at n-2 turns clears blocked flag
# ============================================================================
echo ""
echo "Test 4: Review phase at n-2 turns clears blocked flag"

SID="test-wrapup-4"
cleanup_session "$SID"

# Set turns to max-3 so next turn is max-2 (review turn)
# max=10, turn will be 8 (10-2), which is the review turn
echo "7" > "/tmp/claude-autopilot-turns-${SID}"
echo "old" > "/tmp/claude-autopilot-blocked-${SID}"

OUTPUT=$(run_hook "$SID" CLAUDE_AUTOPILOT_MAX_TURNS=10 CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999)

# Hook should still block (review turn still blocks)
DECISION=$(echo "$OUTPUT" | jq -r '.decision' 2>/dev/null || echo "")
assert_eq "review turn: blocks with decision" "block" "$DECISION"

# But blocked flag should be REMOVED so codex-review can run
assert_file_not_exists "review turn: blocked flag removed for codex-review" "/tmp/claude-autopilot-blocked-${SID}"

# Verify reason starts with review guidance
REASON=$(echo "$OUTPUT" | jq -r '.reason' 2>/dev/null || echo "")
assert_contains "review turn: reason has review guidance" "$REASON" "Official Codex review is running"

cleanup_session "$SID"

# ============================================================================
# Test 5: Normal turn blocks and writes flag
# ============================================================================
echo ""
echo "Test 5: Normal turn blocks and writes blocked flag"

SID="test-wrapup-5"
cleanup_session "$SID"

OUTPUT=$(run_hook "$SID" CLAUDE_AUTOPILOT_MAX_TURNS=20 CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999)

DECISION=$(echo "$OUTPUT" | jq -r '.decision' 2>/dev/null || echo "")
assert_eq "normal turn: blocks" "block" "$DECISION"
assert_file_exists "normal turn: blocked flag written" "/tmp/claude-autopilot-blocked-${SID}"

# Turn counter should be 1
TURN_COUNT=$(cat "/tmp/claude-autopilot-turns-${SID}" 2>/dev/null || echo "")
assert_eq "normal turn: turn counter is 1" "1" "$TURN_COUNT"

REASON=$(echo "$OUTPUT" | jq -r '.reason' 2>/dev/null || echo "")
assert_contains "normal turn: reason has continue guidance" "$REASON" "Continue from where you left off"

cleanup_session "$SID"

# ============================================================================
# Test 6: AUTOPILOT_KEEP_RUNNING_DISABLED=1 allows stop immediately
# ============================================================================
echo ""
echo "Test 6: Disabled override allows stop immediately"

SID="test-wrapup-6"
cleanup_session "$SID"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'
EXIT_CODE=0
OUTPUT=$(echo "$INPUT_JSON" | \
  AUTOPILOT_KEEP_RUNNING_DISABLED=1 \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || EXIT_CODE=$?

assert_eq "disabled: exit code 0" "0" "$EXIT_CODE"
assert_eq "disabled: no output" "" "$OUTPUT"

cleanup_session "$SID"

# ============================================================================
# Test 7: External stop file (CLAUDE_AUTOPILOT_STOP_FILE) triggers allow
# ============================================================================
echo ""
echo "Test 7: External stop file triggers allow"

SID="test-wrapup-7"
cleanup_session "$SID"

EXT_STOP_FILE="/tmp/test-external-stop-${SID}"
touch "$EXT_STOP_FILE"
echo "3" > "/tmp/claude-autopilot-blocked-${SID}"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'
OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_STOP_FILE="$EXT_STOP_FILE" \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

assert_eq "ext stop file: no block output" "" "$OUTPUT"
assert_file_not_exists "ext stop file: blocked flag removed" "/tmp/claude-autopilot-blocked-${SID}"

rm -f "$EXT_STOP_FILE"
cleanup_session "$SID"

# ============================================================================
# Summary
# ============================================================================

print_summary
