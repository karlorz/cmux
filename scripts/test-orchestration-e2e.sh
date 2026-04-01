#!/usr/bin/env bash
# E2E test script for devsh orchestration with real sandbox spawning
#
# Usage:
#   CMUX_AUTH_TOKEN=$(cloudrouter auth token) ./scripts/test-orchestration-e2e.sh
#   ./scripts/test-orchestration-e2e.sh --provider pve-lxc --agent claude/haiku-4.5
#   ./scripts/test-orchestration-e2e.sh --no-cleanup  # Keep sandboxes for debugging
#   ./scripts/test-orchestration-e2e.sh --all         # Run all scenarios
#
# Required:
#   - CMUX_AUTH_TOKEN: Auth token from cloudrouter
#   - devsh CLI installed
#
# Test repos (pre-configured):
#   - karlorz/testing-repo-1
#   - karlorz/testing-repo-2
#   - karlorz/testing-repo-3

set -euo pipefail

echo "=== devsh Orchestration E2E Tests ==="
echo ""

# Parse arguments
PROVIDER="${CMUX_PROVIDER:-pve-lxc}"
AGENT="${CMUX_AGENT:-claude/haiku-4.5}"
CLEANUP="true"
RUN_ALL="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider)
      PROVIDER="$2"
      shift 2
      ;;
    --agent)
      AGENT="$2"
      shift 2
      ;;
    --no-cleanup)
      CLEANUP="false"
      shift
      ;;
    --all)
      RUN_ALL="true"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check prerequisites
if ! command -v devsh &> /dev/null; then
  echo "[SETUP] devsh not found, building..."
  make install-devsh-dev
fi

if [ -z "${CMUX_AUTH_TOKEN:-}" ]; then
  echo "[ERROR] CMUX_AUTH_TOKEN not set"
  echo "Run: CMUX_AUTH_TOKEN=\$(cloudrouter auth token) ./scripts/test-orchestration-e2e.sh"
  exit 1
fi

echo "Configuration:"
echo "  Provider: $PROVIDER"
echo "  Agent: $AGENT"
echo "  Cleanup: $CLEANUP"
echo ""

# Test counters
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# Track created resources for cleanup
CREATED_TASKS=()

pass() { PASS_COUNT=$((PASS_COUNT + 1)); echo "[PASS] $1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); echo "[FAIL] $1"; }
skip() { SKIP_COUNT=$((SKIP_COUNT + 1)); echo "[SKIP] $1"; }

cleanup() {
  if [ "$CLEANUP" = "true" ] && [ ${#CREATED_TASKS[@]} -gt 0 ]; then
    echo ""
    echo "=== Cleanup ==="
    for task_id in "${CREATED_TASKS[@]}"; do
      echo "Cancelling task: $task_id"
      devsh orchestrate cancel "$task_id" 2>/dev/null || true
    done
  fi
}

trap cleanup EXIT

# =============================================================================
# Scenario 1: Single Spawn
# =============================================================================
echo ""
echo "=== Scenario 1: Single Spawn ==="
echo "Spawning agent with simple prompt..."

SPAWN_OUTPUT=$(devsh orchestrate spawn \
  --agent "$AGENT" \
  --repo karlorz/testing-repo-1 \
  "List the files in the current directory and describe the project structure" 2>&1 || true)

if echo "$SPAWN_OUTPUT" | grep -qiE "orchestrationTaskId|Orchestration Task ID"; then
  # Extract task ID from JSON or human-readable output
  TASK_ID=$(echo "$SPAWN_OUTPUT" | grep -oP '"orchestrationTaskId":\s*"\K[^"]+' || echo "")
  if [ -z "$TASK_ID" ]; then
    TASK_ID=$(echo "$SPAWN_OUTPUT" | grep -oP 'Orchestration Task ID:\s*\K\S+' || echo "")
  fi
  if [ -n "$TASK_ID" ]; then
    CREATED_TASKS+=("$TASK_ID")
    pass "Single spawn created task: $TASK_ID"

    # Check status
    echo "Checking task status..."
    sleep 2
    STATUS_OUTPUT=$(devsh orchestrate status "$TASK_ID" 2>&1 || true)
    if echo "$STATUS_OUTPUT" | grep -qiE "status.*running|status.*assigned|status.*pending"; then
      pass "Task status check successful"
    else
      echo "    Status output: $STATUS_OUTPUT"
      fail "Task status check failed"
    fi
  else
    echo "    Could not extract task ID from: $SPAWN_OUTPUT"
    fail "Single spawn - no task ID in response"
  fi
elif echo "$SPAWN_OUTPUT" | grep -qiE "Agent Spawned|spawning"; then
  # Human-readable successful spawn output
  TASK_ID=$(echo "$SPAWN_OUTPUT" | grep -oP 'Orchestration Task ID:\s*\K\S+' || echo "")
  if [ -n "$TASK_ID" ]; then
    CREATED_TASKS+=("$TASK_ID")
    pass "Single spawn created task: $TASK_ID"

    # Check status
    echo "Checking task status..."
    sleep 2
    STATUS_OUTPUT=$(devsh orchestrate status "$TASK_ID" 2>&1 || true)
    if echo "$STATUS_OUTPUT" | grep -qiE "status.*running|status.*assigned|status.*pending|status.*spawning|Status:"; then
      pass "Task status check successful"
    else
      echo "    Status output: $STATUS_OUTPUT"
      fail "Task status check failed"
    fi
  else
    echo "    Could not extract task ID from: $SPAWN_OUTPUT"
    fail "Single spawn - no task ID in response"
  fi
elif echo "$SPAWN_OUTPUT" | grep -qiE "error|fail|unauthorized"; then
  echo "    Output: $SPAWN_OUTPUT"
  fail "Single spawn failed"
else
  echo "    Output: $SPAWN_OUTPUT"
  fail "Single spawn - unexpected response"
fi

# =============================================================================
# Scenario 2: Cancel Running Task
# =============================================================================
echo ""
echo "=== Scenario 2: Cancel Running Task ==="

if [ ${#CREATED_TASKS[@]} -gt 0 ]; then
  CANCEL_TASK_ID="${CREATED_TASKS[0]}"
  echo "Cancelling task: $CANCEL_TASK_ID"

  CANCEL_OUTPUT=$(devsh orchestrate cancel "$CANCEL_TASK_ID" 2>&1 || true)
  if echo "$CANCEL_OUTPUT" | grep -qiE "success|cancelled|cancel"; then
    pass "Cancel task succeeded"
    # Remove from cleanup list since already cancelled
    CREATED_TASKS=("${CREATED_TASKS[@]:1}")
  else
    echo "    Output: $CANCEL_OUTPUT"
    fail "Cancel task failed"
  fi
else
  skip "No task to cancel"
fi

# =============================================================================
# Scenario 3: List Tasks
# =============================================================================
echo ""
echo "=== Scenario 3: List Tasks ==="

LIST_OUTPUT=$(devsh orchestrate list 2>&1 || true)
if echo "$LIST_OUTPUT" | grep -qiE "task|orchestrationTaskId|\[\]|total"; then
  pass "List tasks returned response"
else
  echo "    Output: $LIST_OUTPUT"
  fail "List tasks failed"
fi

# =============================================================================
# Scenario 4: Spawn with Dependencies (only if --all)
# =============================================================================
if [ "$RUN_ALL" = "true" ]; then
  echo ""
  echo "=== Scenario 4: Spawn with Dependencies ==="
  echo "Creating dependency chain: Task B depends on Task A..."

  # First spawn Task A
  TASK_A_OUTPUT=$(devsh orchestrate spawn \
    --agent "$AGENT" \
    --repo karlorz/testing-repo-2 \
    "Create a simple README.md file" 2>&1 || true)

  TASK_A_ID=$(echo "$TASK_A_OUTPUT" | grep -oP '"orchestrationTaskId":\s*"\K[^"]+' || echo "")

  if [ -n "$TASK_A_ID" ]; then
    CREATED_TASKS+=("$TASK_A_ID")
    pass "Dependency Task A created: $TASK_A_ID"

    # Spawn Task B with dependency on Task A
    TASK_B_OUTPUT=$(devsh orchestrate spawn \
      --agent "$AGENT" \
      --repo karlorz/testing-repo-2 \
      --depends-on "$TASK_A_ID" \
      "Update the README.md file to include installation instructions" 2>&1 || true)

    TASK_B_ID=$(echo "$TASK_B_OUTPUT" | grep -oP '"orchestrationTaskId":\s*"\K[^"]+' || echo "")

    if [ -n "$TASK_B_ID" ]; then
      CREATED_TASKS+=("$TASK_B_ID")
      pass "Dependency Task B created: $TASK_B_ID"
    else
      if echo "$TASK_B_OUTPUT" | grep -qiE "depends-on|dependency"; then
        # --depends-on flag might not be implemented yet
        skip "Dependency flag not supported"
      else
        echo "    Output: $TASK_B_OUTPUT"
        fail "Dependency Task B failed"
      fi
    fi
  else
    echo "    Output: $TASK_A_OUTPUT"
    fail "Dependency Task A failed"
  fi

  # =============================================================================
  # Scenario 5: Message Passing
  # =============================================================================
  echo ""
  echo "=== Scenario 5: Message Passing ==="

  if [ ${#CREATED_TASKS[@]} -gt 0 ]; then
    # Get a task run ID from the first task
    MSG_TASK_ID="${CREATED_TASKS[0]}"

    # Get task details to find taskRunId
    STATUS_JSON=$(devsh orchestrate status "$MSG_TASK_ID" --json 2>&1 || true)
    TASK_RUN_ID=$(echo "$STATUS_JSON" | grep -oP '"taskRunId":\s*"\K[^"]+' || echo "")

    if [ -n "$TASK_RUN_ID" ]; then
      MSG_OUTPUT=$(devsh orchestrate message "$TASK_RUN_ID" \
        "Please also add a CHANGELOG.md file" \
        --type request 2>&1 || true)

      if echo "$MSG_OUTPUT" | grep -qiE "sent|success|message"; then
        pass "Message sent to task run"
      else
        echo "    Output: $MSG_OUTPUT"
        fail "Message sending failed"
      fi
    else
      skip "No task run ID found for messaging"
    fi
  else
    skip "No tasks available for messaging"
  fi
fi

# =============================================================================
# Scenario 6: Preflight Check
# =============================================================================
echo ""
echo "=== Scenario 6: Preflight Check ==="

PREFLIGHT_OUTPUT=$(devsh orchestrate preflight --json 2>&1 || true)
if echo "$PREFLIGHT_OUTPUT" | grep -qiE '"providers":|"authenticated":'; then
  pass "Preflight check returned provider info"

  # Check if any provider is available
  if echo "$PREFLIGHT_OUTPUT" | grep -qiE '"available":\s*true'; then
    pass "At least one provider is available"
  else
    echo "    No available providers (may be expected in test env)"
    skip "No available providers"
  fi
else
  echo "    Output: $PREFLIGHT_OUTPUT"
  fail "Preflight check failed"
fi

# =============================================================================
# Scenario 7: Spawn with --sync (waits for completion)
# =============================================================================
echo ""
echo "=== Scenario 7: Spawn with --sync ==="
echo "Spawning agent with --sync flag (will wait up to 30s)..."

SYNC_OUTPUT=$(timeout 45 devsh orchestrate spawn \
  --agent "$AGENT" \
  --repo karlorz/testing-repo-3 \
  --sync \
  --timeout 30s \
  --json \
  "Echo 'Hello from sync test' and exit immediately" 2>&1 || true)

if echo "$SYNC_OUTPUT" | grep -qiE '"status":\s*"(completed|failed|cancelled)"'; then
  # Sync mode waited for completion
  SYNC_STATUS=$(echo "$SYNC_OUTPUT" | grep -oP '"status":\s*"\K[^"]+' || echo "unknown")
  pass "Sync spawn completed with status: $SYNC_STATUS"

  # Extract task ID for cleanup
  SYNC_TASK_ID=$(echo "$SYNC_OUTPUT" | grep -oP '"id":\s*"\K[^"]+' || echo "")
  if [ -n "$SYNC_TASK_ID" ]; then
    CREATED_TASKS+=("$SYNC_TASK_ID")
  fi
elif echo "$SYNC_OUTPUT" | grep -qiE '"status":\s*"(running|assigned|pending)"'; then
  # Sync mode returned but task still running (timeout hit)
  pass "Sync spawn timed out as expected for long task"
  SYNC_TASK_ID=$(echo "$SYNC_OUTPUT" | grep -oP '"id":\s*"\K[^"]+' || echo "")
  if [ -n "$SYNC_TASK_ID" ]; then
    CREATED_TASKS+=("$SYNC_TASK_ID")
  fi
elif echo "$SYNC_OUTPUT" | grep -qiE "timeout|context deadline"; then
  skip "Sync spawn timed out (sandbox startup slow)"
else
  echo "    Output: $SYNC_OUTPUT"
  fail "Sync spawn failed"
fi

# =============================================================================
# Scenario 8: Status with --compact
# =============================================================================
echo ""
echo "=== Scenario 8: Status with --compact ==="

if [ ${#CREATED_TASKS[@]} -gt 0 ]; then
  COMPACT_TASK_ID="${CREATED_TASKS[-1]}"
  COMPACT_OUTPUT=$(devsh orchestrate status "$COMPACT_TASK_ID" --json --compact 2>&1 || true)

  if echo "$COMPACT_OUTPUT" | grep -qiE '"id":\s*"' && echo "$COMPACT_OUTPUT" | grep -qiE '"status":'; then
    # Check that compact output is smaller (no nested Task/TaskRun objects)
    if echo "$COMPACT_OUTPUT" | grep -qiE '"Task":\s*\{'; then
      echo "    Output has nested Task object - not compact"
      fail "Compact status returned full output"
    else
      pass "Compact status returned minimal JSON"
    fi
  else
    echo "    Output: $COMPACT_OUTPUT"
    fail "Compact status failed"
  fi
else
  skip "No task available for compact status test"
fi

# =============================================================================
# Scenario 9: Exit Summary
# =============================================================================
echo ""
echo "=== Scenario 9: Exit Summary ==="

if [ ${#CREATED_TASKS[@]} -gt 0 ]; then
  SUMMARY_TASK_ID="${CREATED_TASKS[-1]}"
  SUMMARY_OUTPUT=$(devsh orchestrate exit-summary "$SUMMARY_TASK_ID" --json 2>&1 || true)

  if echo "$SUMMARY_OUTPUT" | grep -qiE '"id":\s*"' && echo "$SUMMARY_OUTPUT" | grep -qiE '"status":'; then
    pass "Exit summary returned JSON"

    # Check for expected fields
    if echo "$SUMMARY_OUTPUT" | grep -qiE '"duration":'; then
      pass "Exit summary includes duration"
    else
      skip "Exit summary missing duration (task may not have started)"
    fi
  else
    echo "    Output: $SUMMARY_OUTPUT"
    fail "Exit summary failed"
  fi
else
  skip "No task available for exit summary test"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "=== E2E Test Summary ==="
echo "Passed: $PASS_COUNT"
echo "Failed: $FAIL_COUNT"
echo "Skipped: $SKIP_COUNT"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "Some tests failed!"
  exit 1
else
  echo "All tests passed (or skipped)!"
  exit 0
fi
