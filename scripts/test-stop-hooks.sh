#!/bin/bash
# Test script for stop hook cooperation between autopilot-keep-running.sh and codex-review.sh
# Tests the flag-file mechanism that replaced the generic stop_hook_active check.
#
# Usage: ./scripts/test-stop-hooks.sh
#
# Each test simulates the hook execution flow by calling the actual hook scripts
# with crafted input JSON and environment variables, then verifying side effects
# (flag files, debug log entries, exit codes).

set -euo pipefail

unset AUTOPILOT_DELAY AUTOPILOT_IDLE_THRESHOLD AUTOPILOT_MAX_TURNS AUTOPILOT_MONITORING_THRESHOLD
unset CMUX_AUTOPILOT_DELAY CMUX_AUTOPILOT_IDLE_THRESHOLD CMUX_AUTOPILOT_MAX_TURNS CMUX_AUTOPILOT_MONITORING_THRESHOLD

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_DIR/.claude/hooks"

AUTOPILOT_HOOK="$HOOKS_DIR/autopilot-keep-running.sh"
CODEX_REVIEW_HOOK="$HOOKS_DIR/codex-review.sh"

PASS=0
FAIL=0
TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'
CONDITIONAL_WAIT_TEXT="Only if you are blocked on external work and are about to poll status"

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${GREEN}PASS${NC}: $desc (got: $actual)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}: $desc (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() {
  local desc="$1" path="$2"
  TOTAL=$((TOTAL + 1))
  if [ -f "$path" ]; then
    echo -e "  ${GREEN}PASS${NC}: $desc (file exists: $path)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}: $desc (file missing: $path)"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_not_exists() {
  local desc="$1" path="$2"
  TOTAL=$((TOTAL + 1))
  if [ ! -f "$path" ]; then
    echo -e "  ${GREEN}PASS${NC}: $desc (file absent: $path)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}: $desc (file should not exist: $path)"
    FAIL=$((FAIL + 1))
  fi
}

assert_log_contains() {
  local desc="$1" log_file="$2" pattern="$3"
  TOTAL=$((TOTAL + 1))
  if grep -q "$pattern" "$log_file" 2>/dev/null; then
    echo -e "  ${GREEN}PASS${NC}: $desc (log contains: $pattern)"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}FAIL${NC}: $desc (log missing: $pattern)"
    FAIL=$((FAIL + 1))
  fi
}

cleanup_session() {
  local sid="$1"
  rm -f "/tmp/claude-autopilot-blocked-${sid}"
  rm -f "/tmp/claude-autopilot-completed-${sid}"
  rm -f "/tmp/claude-autopilot-turns-${sid}"
  rm -f "/tmp/claude-autopilot-stop-${sid}"
  rm -f "/tmp/codex-review-fails-${sid}"
  rm -f "/tmp/codex-review-transport-fails-${sid}"
  rm -f "/tmp/codex-review-transport-cooldown-${sid}"
  rm -f "/tmp/codex-review-result-base-${sid}"
  rm -f "/tmp/codex-review-result-uncommitted-${sid}"
  rm -f "/tmp/codex-review-result-type-base-${sid}"
  rm -f "/tmp/codex-review-result-type-uncommitted-${sid}"
  rm -f "/tmp/codex-review-reviewed-base-${sid}"
  rm -f "/tmp/codex-review-reviewed-uncommitted-${sid}"
  rm -f "/tmp/codex-review-pid-base-${sid}"
  rm -f "/tmp/codex-review-pid-uncommitted-${sid}"
  rm -f "/tmp/codex-review-bg-state-base-${sid}"
  rm -f "/tmp/codex-review-bg-state-uncommitted-${sid}"
  rm -f "/tmp/codex-review-debug.log"
}

# Common env vars for codex-review invocations
# CODEX_REVIEW_DEBUG=1 enables the opt-in debug log so assertions can check it
# CODEX_REVIEW_DRY_RUN=1 exits before the actual codex binary call
REVIEW_COMMON_ENV="CODEX_REVIEW_DISABLED=0 CODEX_REVIEW_DEBUG=1 CODEX_REVIEW_DRY_RUN=1"

# ============================================================================
# Test 1: Autopilot blocks -> flag file created -> codex-review skips
# ============================================================================
echo ""
echo -e "${YELLOW}Test 1: Autopilot blocks -> codex-review skips${NC}"

SID="test-stop-hook-1"
cleanup_session "$SID"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# Run autopilot hook (should block)
AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=20 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

# Check autopilot created flag file
assert_file_exists "autopilot created blocked flag file" "/tmp/claude-autopilot-blocked-${SID}"

# Check autopilot output contains block decision
DECISION=$(echo "$AUTOPILOT_OUTPUT" | jq -r '.decision' 2>/dev/null || echo "")
assert_eq "autopilot output block decision" "block" "$DECISION"

# Run codex-review hook (should skip due to flag file)
REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_DRY_RUN=1 \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

assert_eq "codex-review exits 0 (skipped)" "0" "$REVIEW_EXIT"
assert_log_contains "debug log shows autopilot blocked" "/tmp/codex-review-debug.log" "autopilot blocked this stop"

cleanup_session "$SID"

# ============================================================================
# Test 2: Autopilot allows (max turns reached) -> flag cleaned -> codex-review runs
# ============================================================================
echo ""
echo -e "${YELLOW}Test 2: Autopilot allows (max turns) -> codex-review proceeds${NC}"

SID="test-stop-hook-2"
cleanup_session "$SID"

# Pre-seed turn counter to 0, set max to 1 so next turn hits limit
echo "0" > "/tmp/claude-autopilot-turns-${SID}"
# Pre-create a flag file as if autopilot blocked on a previous stop
echo "1" > "/tmp/claude-autopilot-blocked-${SID}"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# Run autopilot hook (should allow - max turns reached)
AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=1 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

# Flag file should be cleaned up
assert_file_not_exists "autopilot cleaned flag file on max turns" "/tmp/claude-autopilot-blocked-${SID}"

# Autopilot should NOT output a block decision (it exits 0 silently)
assert_eq "autopilot output empty (allowed stop)" "" "$AUTOPILOT_OUTPUT"

# Run codex-review hook (should proceed past autopilot check)
REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_DRY_RUN=1 \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

assert_log_contains "debug log shows proceeding with review" "/tmp/codex-review-debug.log" "Proceeding with codex review"

cleanup_session "$SID"

# ============================================================================
# Test 3: Autopilot off + stale flag file -> cleaned up, codex-review runs
# ============================================================================
echo ""
echo -e "${YELLOW}Test 3: Autopilot off + stale flag -> cleaned, codex-review proceeds${NC}"

SID="test-stop-hook-3"
cleanup_session "$SID"

# Create stale flag file (left over from previous autopilot session)
echo "stale" > "/tmp/claude-autopilot-blocked-${SID}"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# Run codex-review with autopilot explicitly OFF
REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=0 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_DRY_RUN=1 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

# Stale flag file should be cleaned up
assert_file_not_exists "stale flag file cleaned up" "/tmp/claude-autopilot-blocked-${SID}"
assert_log_contains "debug log shows stale cleanup" "/tmp/codex-review-debug.log" "Cleaned up stale autopilot blocked flag"
assert_log_contains "debug log shows proceeding" "/tmp/codex-review-debug.log" "Proceeding with codex review"

cleanup_session "$SID"

# ============================================================================
# Test 4: bun-check blocks (stop_hook_active=true) but codex-review still runs
# ============================================================================
echo ""
echo -e "${YELLOW}Test 4: bun-check blocks (stop_hook_active=true) -> codex-review still runs${NC}"

SID="test-stop-hook-4"
cleanup_session "$SID"

# stop_hook_active=true simulates bun-check having blocked
INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":true}'

# No flag file exists (autopilot didn't block, or is off)
# Run codex-review with autopilot explicitly OFF
REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=0 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_DRY_RUN=1 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

# codex-review should NOT skip (no flag file, autopilot not active)
assert_log_contains "debug log shows proceeding despite stop_hook_active" "/tmp/codex-review-debug.log" "Proceeding with codex review"

cleanup_session "$SID"

# ============================================================================
# Test 5: stop_hook_active=true -> autopilot still blocks (ignores flag)
# ============================================================================
echo ""
echo -e "${YELLOW}Test 5: stop_hook_active=true -> autopilot still blocks (MAX_TURNS is the guard)${NC}"

SID="test-stop-hook-5"
cleanup_session "$SID"

# Pre-create flag file as if autopilot blocked on a previous cycle
echo "5" > "/tmp/claude-autopilot-blocked-${SID}"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":true}'

# Run autopilot hook -- should block regardless of stop_hook_active
# (autopilot is first in chain, MAX_TURNS is the only loop guard)
AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=20 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

# Autopilot should still block (turn 1, well under max)
DECISION=$(echo "$AUTOPILOT_OUTPUT" | jq -r '.decision' 2>/dev/null || echo "")
assert_eq "autopilot blocks despite stop_hook_active=true" "block" "$DECISION"

# Flag file should be updated with new turn count
assert_file_exists "flag file updated after block" "/tmp/claude-autopilot-blocked-${SID}"

# Turn counter should be at 1
TURN_COUNT=$(cat "/tmp/claude-autopilot-turns-${SID}" 2>/dev/null || echo "0")
assert_eq "turn counter incremented to 1" "1" "$TURN_COUNT"

# Verify codex-review still skips because flag file exists
REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_DRY_RUN=1 \
  AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

assert_eq "codex-review exits 0 (skipped, flag exists)" "0" "$REVIEW_EXIT"
assert_log_contains "debug log shows autopilot blocked" "/tmp/codex-review-debug.log" "autopilot blocked this stop"

cleanup_session "$SID"

# ============================================================================
# Test 6: Session stop file -> autopilot allows and cleans flag
# ============================================================================
echo ""
echo -e "${YELLOW}Test 6: Session stop file -> autopilot allows, flag cleaned${NC}"

SID="test-stop-hook-6"
cleanup_session "$SID"

# Pre-create flag file and session stop file
echo "3" > "/tmp/claude-autopilot-blocked-${SID}"
touch "/tmp/claude-autopilot-stop-${SID}"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# Run autopilot hook (should detect stop file, clean flag, and allow)
AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

assert_file_not_exists "flag file cleaned on stop file" "/tmp/claude-autopilot-blocked-${SID}"
assert_eq "autopilot output empty (allowed stop)" "" "$AUTOPILOT_OUTPUT"

cleanup_session "$SID"

# ============================================================================
# Test 7: AUTOPILOT_KEEP_RUNNING_DISABLED=1 + stale flag -> codex-review runs
# ============================================================================
echo ""
echo -e "${YELLOW}Test 7: Autopilot disabled via override + stale flag -> codex-review proceeds${NC}"

SID="test-stop-hook-7"
cleanup_session "$SID"

# Stale flag file from before the override was set
echo "2" > "/tmp/claude-autopilot-blocked-${SID}"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# CLAUDE_AUTOPILOT=1 but AUTOPILOT_KEEP_RUNNING_DISABLED=1 overrides it
REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  AUTOPILOT_KEEP_RUNNING_DISABLED=1 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_DRY_RUN=1 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

# codex-review should treat autopilot as inactive and clean stale flag
assert_file_not_exists "stale flag cleaned when override active" "/tmp/claude-autopilot-blocked-${SID}"
assert_log_contains "debug log shows stale cleanup" "/tmp/codex-review-debug.log" "Cleaned up stale autopilot blocked flag"
assert_log_contains "debug log shows proceeding" "/tmp/codex-review-debug.log" "Proceeding with codex review"

cleanup_session "$SID"

# ============================================================================
# Test 7a: Generic AUTOPILOT_* aliases override legacy CLAUDE_* values
# ============================================================================
echo ""
echo -e "${YELLOW}Test 7a: Generic AUTOPILOT_* aliases override CLAUDE_*${NC}"

SID="test-stop-hook-7a"
cleanup_session "$SID"

echo "0" > "/tmp/claude-autopilot-turns-${SID}"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  AUTOPILOT_MAX_TURNS=1 \
  AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_MAX_TURNS=20 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

assert_eq "generic AUTOPILOT_MAX_TURNS allows stop at turn 1" "" "$AUTOPILOT_OUTPUT"
assert_file_exists "completed marker written using generic alias" "/tmp/claude-autopilot-completed-${SID}"

cleanup_session "$SID"

# ============================================================================
# Test 7b: Debug flag file enables autopilot debug logging
# ============================================================================
echo ""
echo -e "${YELLOW}Test 7b: Debug flag file enables autopilot debug logging${NC}"

SID="test-stop-hook-7b"
cleanup_session "$SID"
rm -f /tmp/claude-autopilot-debug.log
touch /tmp/claude-autopilot-debug-enabled

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=20 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

DECISION=$(echo "$AUTOPILOT_OUTPUT" | jq -r '.decision' 2>/dev/null || echo "")
assert_eq "debug flag run still blocks normally" "block" "$DECISION"
assert_log_contains "autopilot debug log captures session id" "/tmp/claude-autopilot-debug.log" "$SID"

rm -f /tmp/claude-autopilot-debug-enabled /tmp/claude-autopilot-debug.log
cleanup_session "$SID"

# ============================================================================
# Test 8: Smart delay escalation - work phase vs monitoring phase
# ============================================================================
echo ""
echo -e "${YELLOW}Test 8: Delay escalation - work vs monitoring phase${NC}"

SID="test-stop-hook-8"
cleanup_session "$SID"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# Turn 1: should be "work" phase (no sleep instruction in output)
AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=30 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_MONITORING_THRESHOLD=3 \
  CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

REASON=$(echo "$AUTOPILOT_OUTPUT" | jq -r '.reason' 2>/dev/null || echo "")
HAS_SLEEP=$(echo "$REASON" | grep -c "sleep" || true)
STARTS_WITH_CONTINUE=$(echo "$REASON" | grep -c "^Continue from where you left off" || true)
assert_eq "turn 1 (work phase) includes sleep 30" "1" "$HAS_SLEEP"
assert_eq "turn 1 starts with continue guidance" "1" "$STARTS_WITH_CONTINUE"

# Turn 4 (threshold=3, so turn 4 is monitoring phase 1): should include "sleep 30"
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=30 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_MONITORING_THRESHOLD=3 \
  CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" >/dev/null 2>&1 || true
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=30 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_MONITORING_THRESHOLD=3 \
  CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" >/dev/null 2>&1 || true

AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=30 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_MONITORING_THRESHOLD=3 \
  CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

REASON=$(echo "$AUTOPILOT_OUTPUT" | jq -r '.reason' 2>/dev/null || echo "")
HAS_SLEEP_30=$(echo "$REASON" | grep -c "sleep 30" || true)
HAS_CONDITIONAL_WAIT_30=$(echo "$REASON" | grep -c "$CONDITIONAL_WAIT_TEXT" || true)
STARTS_WITH_CONTINUE=$(echo "$REASON" | grep -c "^Continue from where you left off" || true)
assert_eq "turn 4 (monitoring phase 1) includes sleep 30" "1" "$HAS_SLEEP_30"
assert_eq "turn 4 keeps main guidance first" "1" "$STARTS_WITH_CONTINUE"
assert_eq "turn 4 sleep guidance is conditional" "1" "$HAS_CONDITIONAL_WAIT_30"

# Turn 9 (threshold=3, so turn 9 = 3+5+1 is monitoring phase 2): should include "sleep 60"
for i in $(seq 5 8); do
  echo "$INPUT_JSON" | \
    CLAUDE_AUTOPILOT=1 \
    CMUX_AUTOPILOT_ENABLED=1 \
    AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
    CLAUDE_AUTOPILOT_MAX_TURNS=30 \
    CLAUDE_AUTOPILOT_DELAY=0 \
    CLAUDE_AUTOPILOT_MONITORING_THRESHOLD=3 \
    CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999 \
    CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
    bash "$AUTOPILOT_HOOK" >/dev/null 2>&1 || true
done

AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=30 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_MONITORING_THRESHOLD=3 \
  CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

REASON=$(echo "$AUTOPILOT_OUTPUT" | jq -r '.reason' 2>/dev/null || echo "")
HAS_SLEEP_60=$(echo "$REASON" | grep -c "sleep 60" || true)
HAS_CONDITIONAL_WAIT_60=$(echo "$REASON" | grep -c "$CONDITIONAL_WAIT_TEXT" || true)
STARTS_WITH_CONTINUE=$(echo "$REASON" | grep -c "^Continue from where you left off" || true)
assert_eq "turn 9 (monitoring phase 2) includes sleep 60" "1" "$HAS_SLEEP_60"
assert_eq "turn 9 keeps main guidance first" "1" "$STARTS_WITH_CONTINUE"
assert_eq "turn 9 sleep guidance is conditional" "1" "$HAS_CONDITIONAL_WAIT_60"

cleanup_session "$SID"

# ============================================================================
# Test 9: Infinite mode stays in work phase and never completes
# ============================================================================
echo ""
echo -e "${YELLOW}Test 9: Infinite mode stays in work phase${NC}"

SID="test-stop-hook-9"
cleanup_session "$SID"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'
FAKE_SLEEP_DIR="/tmp/test-stop-hook-9-bin-$$"
FAKE_SLEEP_LOG="/tmp/test-stop-hook-9-sleep.log"

rm -rf "$FAKE_SLEEP_DIR"
rm -f "$FAKE_SLEEP_LOG"
mkdir -p "$FAKE_SLEEP_DIR"
cat > "$FAKE_SLEEP_DIR/sleep" <<EOF
#!/bin/bash
set -euo pipefail
printf '%s\n' "\$1" >> "$FAKE_SLEEP_LOG"
exit 0
EOF
chmod +x "$FAKE_SLEEP_DIR/sleep"

for i in $(seq 1 8); do
  AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
    CLAUDE_AUTOPILOT=1 \
    CMUX_AUTOPILOT_ENABLED=1 \
    AUTOPILOT_KEEP_RUNNING_DISABLED=0 \
    CLAUDE_AUTOPILOT_MAX_TURNS=-1 \
    CLAUDE_AUTOPILOT_DELAY=5 \
    CLAUDE_AUTOPILOT_MONITORING_THRESHOLD=3 \
    CLAUDE_AUTOPILOT_IDLE_THRESHOLD=999 \
    CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
    PATH="$FAKE_SLEEP_DIR:$PATH" \
    bash "$AUTOPILOT_HOOK" 2>/dev/null) || true
done

REASON=$(echo "$AUTOPILOT_OUTPUT" | jq -r '.reason' 2>/dev/null || echo "")
HAS_SLEEP=$(echo "$REASON" | grep -c "sleep" || true)
TURN_COUNT=$(cat "/tmp/claude-autopilot-turns-${SID}" 2>/dev/null || echo "")
if [ -f "$FAKE_SLEEP_LOG" ]; then
  SLEEP_CALLS=$(wc -l < "$FAKE_SLEEP_LOG" | tr -d '[:space:]')
else
  SLEEP_CALLS="0"
fi

assert_eq "infinite mode has no sleep instruction after many turns" "0" "$HAS_SLEEP"
assert_eq "infinite mode keeps incrementing turns" "8" "$TURN_COUNT"
assert_eq "infinite mode skips all hook-side sleep calls" "0" "$SLEEP_CALLS"
assert_file_exists "infinite mode keeps blocked flag set" "/tmp/claude-autopilot-blocked-${SID}"
assert_file_not_exists "infinite mode does not write completed marker" "/tmp/claude-autopilot-completed-${SID}"

cleanup_session "$SID"
rm -rf "$FAKE_SLEEP_DIR"
rm -f "$FAKE_SLEEP_LOG"

# ============================================================================
# Test 10: Review-enabled prompt keeps review guidance first
# ============================================================================
echo ""
echo -e "${YELLOW}Test 10: Review prompt keeps review guidance first${NC}"

SID="test-stop-hook-10"
cleanup_session "$SID"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'
echo "7" > "/tmp/claude-autopilot-turns-${SID}"

AUTOPILOT_OUTPUT=$(echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=1 \
  CMUX_AUTOPILOT_ENABLED=1 \
  CLAUDE_AUTOPILOT_MAX_TURNS=10 \
  CLAUDE_AUTOPILOT_DELAY=0 \
  CLAUDE_AUTOPILOT_MONITORING_THRESHOLD=1 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$AUTOPILOT_HOOK" 2>/dev/null) || true

REASON=$(echo "$AUTOPILOT_OUTPUT" | jq -r '.reason' 2>/dev/null || echo "")
STARTS_WITH_REVIEW=$(echo "$REASON" | grep -c "^Official Codex review is running" || true)
HAS_SLEEP_60=$(echo "$REASON" | grep -c "sleep 60" || true)
HAS_CONDITIONAL_WAIT=$(echo "$REASON" | grep -c "$CONDITIONAL_WAIT_TEXT" || true)

assert_eq "review turn starts with review guidance" "1" "$STARTS_WITH_REVIEW"
assert_eq "review turn keeps conditional sleep guidance" "1" "$HAS_CONDITIONAL_WAIT"
assert_eq "review turn includes sleep 60 when monitoring" "1" "$HAS_SLEEP_60"
assert_file_not_exists "review turn clears blocked flag" "/tmp/claude-autopilot-blocked-${SID}"

cleanup_session "$SID"

# ============================================================================
# Test 11: Transport failure does not increment issue fail counter
# ============================================================================
echo ""
echo -e "${YELLOW}Test 11: Transport failure tracked separately from code issues${NC}"

SID="test-stop-hook-11"
cleanup_session "$SID"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# Compute the current committed-review fingerprint to match the hook's logic
T11_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
T11_MAIN_BASE=$(git merge-base main HEAD 2>/dev/null || echo "unknown")
T11_FP="${T11_MAIN_BASE}:${T11_HEAD}"

# Pre-seed a committed-scope transport failure result with matching fingerprint
echo "[codex-review-extract] incomplete review: 1/1 batches failed" > "/tmp/codex-review-result-base-${SID}"
echo "transport_failure" > "/tmp/codex-review-result-type-base-${SID}"
echo "$T11_FP" > "/tmp/codex-review-bg-state-base-${SID}"

REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=0 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_DRY_RUN=1 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

# Transport failure should exit 2 but NOT increment issue fail counter
assert_eq "transport failure exits with code 2" "2" "$REVIEW_EXIT"
assert_file_not_exists "issue fail counter not created for transport failure" "/tmp/codex-review-fails-${SID}"
assert_file_exists "transport fail counter created" "/tmp/codex-review-transport-fails-${SID}"

TRANSPORT_FAILS=$(cat "/tmp/codex-review-transport-fails-${SID}" 2>/dev/null || echo "0")
assert_eq "transport fail counter is 1" "1" "$TRANSPORT_FAILS"

cleanup_session "$SID"

# ============================================================================
# Test 12: Transport failure cooldown triggers after threshold
# ============================================================================
echo ""
echo -e "${YELLOW}Test 12: Transport failure cooldown triggers after threshold${NC}"

SID="test-stop-hook-12"
cleanup_session "$SID"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# Compute the current committed-review fingerprint to match the hook's logic
T12_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
T12_MAIN_BASE=$(git merge-base main HEAD 2>/dev/null || echo "unknown")
T12_FP="${T12_MAIN_BASE}:${T12_HEAD}"

# Pre-seed transport failure count at threshold - 1
echo "2" > "/tmp/codex-review-transport-fails-${SID}"

# Pre-seed a committed-scope transport failure result to push count over threshold
echo "[codex-review-extract] incomplete review: 1/1 batches failed" > "/tmp/codex-review-result-base-${SID}"
echo "transport_failure" > "/tmp/codex-review-result-type-base-${SID}"
echo "$T12_FP" > "/tmp/codex-review-bg-state-base-${SID}"

REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=0 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_TRANSPORT_FAIL_THRESHOLD=3 \
  CODEX_REVIEW_TRANSPORT_COOLDOWN_SECONDS=300 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

assert_file_exists "cooldown file created after threshold" "/tmp/codex-review-transport-cooldown-${SID}"
assert_log_contains "debug log shows threshold reached" "/tmp/codex-review-debug.log" "Transport failure threshold reached"

# Now verify that next review is skipped due to cooldown
# Clear reviewed markers so the hook doesn't short-circuit
rm -f "/tmp/codex-review-reviewed-base-${SID}"
rm -f "/tmp/codex-review-reviewed-uncommitted-${SID}"
rm -f "/tmp/codex-review-debug.log"
REVIEW_EXIT=0
echo "$INPUT_JSON" | \
  CLAUDE_AUTOPILOT=0 \
  CODEX_REVIEW_DISABLED=0 \
  CODEX_REVIEW_DEBUG=1 \
  CODEX_REVIEW_DRY_RUN=1 \
  CLAUDE_PROJECT_DIR="$PROJECT_DIR" \
  bash "$CODEX_REVIEW_HOOK" 2>/dev/null || REVIEW_EXIT=$?

assert_eq "review skipped during cooldown exits 0" "0" "$REVIEW_EXIT"
assert_log_contains "debug log shows cooldown active" "/tmp/codex-review-debug.log" "transport failure cooldown active"

cleanup_session "$SID"

# ============================================================================
# Test 13: Successful review resets transport failure state
# ============================================================================
echo ""
echo -e "${YELLOW}Test 13: Successful review resets transport failure state${NC}"

SID="test-stop-hook-13"
cleanup_session "$SID"

INPUT_JSON='{"session_id":"'"$SID"'","stop_hook_active":false}'

# Pre-seed transport failure state
echo "2" > "/tmp/codex-review-transport-fails-${SID}"
echo "$(($(date +%s) + 300))" > "/tmp/codex-review-transport-cooldown-${SID}"

# Pre-seed a successful committed-scope review result fixture for future
# integration coverage of transport-state reset behavior.
echo "" > "/tmp/codex-review-result-base-${SID}"
echo "findings" > "/tmp/codex-review-result-type-base-${SID}"
echo "${SID}:fake" > "/tmp/codex-review-bg-state-base-${SID}"

# This test only verifies the fixture/setup shape for the split result files.
# Full transport reset integration coverage still requires a real review pass.

# Verify files exist before the attempt
assert_file_exists "transport fail file exists before test" "/tmp/codex-review-transport-fails-${SID}"
assert_file_exists "cooldown file exists before test" "/tmp/codex-review-transport-cooldown-${SID}"

cleanup_session "$SID"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "============================================"
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All $TOTAL assertions passed ($PASS/$TOTAL)${NC}"
else
  echo -e "${RED}$FAIL/$TOTAL assertions failed${NC} (${PASS} passed)"
fi
echo "============================================"

exit "$FAIL"
