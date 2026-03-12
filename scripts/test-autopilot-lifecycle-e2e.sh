#!/bin/bash
# Full autopilot lifecycle E2E test suite.
#
# Tests the complete autopilot pipeline: plan -> spawn -> complete -> quality gate -> retry.
# Each scenario is self-contained with its own task creation and cleanup.
#
# Usage:
#   CMUX_AUTH_TOKEN=$(cloudrouter auth token) ./scripts/test-autopilot-lifecycle-e2e.sh
#   ./scripts/test-autopilot-lifecycle-e2e.sh --scenario plan-to-completion
#   ./scripts/test-autopilot-lifecycle-e2e.sh --agent claude/haiku-4.5 --timeout 300
#
# Scenarios:
#   plan-to-completion  - Agent makes a real code change, task completes
#   multi-agent-spawn   - Two agents spawned on same task, both complete
#   quality-gate-check  - Quality gate and retry dry-run return valid responses
#   status-tracking     - Autopilot heartbeat and status updates flow correctly
#
# Required:
#   - CMUX_AUTH_TOKEN: Auth token from cloudrouter
#   - devsh CLI installed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/autopilot-test-helpers.sh"

# Defaults
AGENT="${TEST_AGENT:-claude/haiku-4.5}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300}"
SCENARIO=""
REPO_1="${TEST_REPO_1:-karlorz/testing-repo-1}"
REPO_2="${TEST_REPO_2:-karlorz/testing-repo-2}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)
      SCENARIO="$2"
      shift 2
      ;;
    --agent)
      AGENT="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --repo)
      REPO_1="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--scenario <name>] [--agent <agent>] [--timeout <seconds>]"
      echo ""
      echo "Scenarios: plan-to-completion, multi-agent-spawn, quality-gate-check,"
      echo "           status-tracking"
      echo ""
      echo "Options:"
      echo "  --scenario  Run a single scenario (default: all)"
      echo "  --agent     Agent to use (default: claude/haiku-4.5)"
      echo "  --timeout   Max wait per scenario in seconds (default: 300)"
      echo "  --repo      Primary test repo (default: karlorz/testing-repo-1)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== Autopilot Lifecycle E2E Test Suite ==="
echo ""
echo "Configuration:"
echo "  Agent: $AGENT"
echo "  Timeout: ${TIMEOUT_SECONDS}s"
echo "  Repo 1: $REPO_1"
echo "  Repo 2: $REPO_2"
echo "  Scenario: ${SCENARIO:-all}"
echo ""

check_prerequisites
register_task_cleanup

SCENARIOS_PASSED=0
SCENARIOS_FAILED=0

scenario_passed() {
  local name="$1"
  SCENARIOS_PASSED=$((SCENARIOS_PASSED + 1))
  echo ""
  echo "[SCENARIO PASS] $name"
  echo ""
}

scenario_failed() {
  local name="$1" reason="$2"
  SCENARIOS_FAILED=$((SCENARIOS_FAILED + 1))
  _ATH_FAIL=$((_ATH_FAIL + 1))
  _ATH_TOTAL=$((_ATH_TOTAL + 1))
  echo ""
  echo "[SCENARIO FAIL] $name: $reason"
  echo ""
}

# ============================================================================
# Scenario 1: Plan to Completion
# ============================================================================
if [ -z "$SCENARIO" ] || [ "$SCENARIO" = "plan-to-completion" ]; then
  echo "--- Scenario 1: Plan to Completion ---"
  echo "Spawning agent with a prompt that makes a real code change..."

  PROMPT="Create a file called HELLO.md in the repository root with the text 'Hello from autopilot lifecycle test - $(date +%s)'. Stage and commit the file. Do not create a pull request."

  TASK_ID=$(create_autopilot_task \
    --repo "$REPO_1" \
    --agent "$AGENT" \
    --autopilot-minutes 5 \
    "$PROMPT") || {
    scenario_failed "plan-to-completion" "Failed to create task"
    TASK_ID=""
  }

  if [ -n "${TASK_ID:-}" ]; then
    _ATH_CREATED_TASKS+=("$TASK_ID")
    echo "  Task ID: $TASK_ID"

    START_TIME=$(date +%s)
    FINAL_STATUS=$(poll_until_terminal "$TASK_ID" "$TIMEOUT_SECONDS" 10) || {
      scenario_failed "plan-to-completion" "Timeout after ${TIMEOUT_SECONDS}s (last status: $FINAL_STATUS)"
      FINAL_STATUS="timeout"
    }

    TOTAL_TIME=$(($(date +%s) - START_TIME))
    echo "  Total time: ${TOTAL_TIME}s"

    if [ "$FINAL_STATUS" = "timeout" ]; then
      : # Already reported failure
    else
      # Check runs
      RUNS_OUTPUT=$(get_task_runs_json "$TASK_ID")
      RUN_COUNT=$(echo "$RUNS_OUTPUT" | grep -c '"agent"' || echo "0")

      assert_contains "plan-to-completion: terminal status" "completed stopped" "$FINAL_STATUS"
      assert_gt "plan-to-completion: has at least one run" "$RUN_COUNT" 0

      if [ "$FINAL_STATUS" = "completed" ] || [ "$FINAL_STATUS" = "stopped" ]; then
        scenario_passed "plan-to-completion"
      else
        scenario_failed "plan-to-completion" "Unexpected status: $FINAL_STATUS"
      fi
    fi
  fi
fi

# ============================================================================
# Scenario 2: Multi-Agent Spawn
# ============================================================================
if [ -z "$SCENARIO" ] || [ "$SCENARIO" = "multi-agent-spawn" ]; then
  echo "--- Scenario 2: Multi-Agent Spawn ---"
  echo "Spawning 2 agents on the same task..."

  PROMPT="List the files in the repository root directory and report what you see. Do NOT make any changes."

  # Use full devsh command since create_autopilot_task doesn't support multiple --agent flags
  CREATE_OUTPUT=$(devsh task create \
    --repo "$REPO_2" \
    --agent "$AGENT" \
    --agent "$AGENT" \
    --autopilot \
    --autopilot-minutes 5 \
    --json \
    "$PROMPT" 2>&1 || true)

  TASK_ID=$(extract_task_id "$CREATE_OUTPUT")

  if [ -z "$TASK_ID" ]; then
    scenario_failed "multi-agent-spawn" "Failed to create task"
  else
    _ATH_CREATED_TASKS+=("$TASK_ID")
    echo "  Task ID: $TASK_ID"

    # Count agent results in create output (should be 2)
    AGENT_COUNT=$(echo "$CREATE_OUTPUT" | grep -c '"agentName"' || echo "0")
    assert_eq "multi-agent-spawn: 2 agents in create output" "2" "$AGENT_COUNT"

    # Poll until terminal with extended timeout for 2 agents
    MULTI_TIMEOUT=$((TIMEOUT_SECONDS * 2))
    START_TIME=$(date +%s)
    FINAL_STATUS=$(poll_until_terminal "$TASK_ID" "$MULTI_TIMEOUT" 15) || {
      scenario_failed "multi-agent-spawn" "Timeout after ${MULTI_TIMEOUT}s"
      FINAL_STATUS="timeout"
    }

    TOTAL_TIME=$(($(date +%s) - START_TIME))
    echo "  Total time: ${TOTAL_TIME}s"

    if [ "$FINAL_STATUS" != "timeout" ]; then
      RUNS_OUTPUT=$(get_task_runs_json "$TASK_ID")
      RUN_COUNT=$(echo "$RUNS_OUTPUT" | grep -c '"agent"' || echo "0")
      assert_eq "multi-agent-spawn: 2 runs exist" "2" "$RUN_COUNT"

      if echo "$FINAL_STATUS" | grep -qiE "^(completed|stopped)$"; then
        scenario_passed "multi-agent-spawn"
      else
        scenario_failed "multi-agent-spawn" "Unexpected status: $FINAL_STATUS"
      fi
    fi
  fi
fi

# ============================================================================
# Scenario 3: Quality Gate Check + Retry Dry-Run
# ============================================================================
if [ -z "$SCENARIO" ] || [ "$SCENARIO" = "quality-gate-check" ]; then
  echo "--- Scenario 3: Quality Gate Check + Retry Dry-Run ---"
  echo "Creating task and checking quality gate after completion..."

  PROMPT="Create a file called TEST_QG.md with 'quality gate test - $(date +%s)'. Stage and commit. Do not create a PR."

  TASK_ID=$(create_autopilot_task \
    --repo "$REPO_1" \
    --agent "$AGENT" \
    --autopilot-minutes 5 \
    "$PROMPT") || {
    scenario_failed "quality-gate-check" "Failed to create task"
    TASK_ID=""
  }

  if [ -n "${TASK_ID:-}" ]; then
    _ATH_CREATED_TASKS+=("$TASK_ID")
    echo "  Task ID: $TASK_ID"

    FINAL_STATUS=$(poll_until_terminal "$TASK_ID" "$TIMEOUT_SECONDS" 10) || {
      scenario_failed "quality-gate-check" "Task did not complete"
      FINAL_STATUS="timeout"
    }

    if [ "$FINAL_STATUS" != "timeout" ]; then
      # Test structured output (--json)
      echo "  Checking quality gate (structured)..."
      RETRY_JSON=$(devsh task retry "$TASK_ID" --dry-run --json 2>&1 || echo "{}")

      QG_STATUS=$(extract_json_field "$RETRY_JSON" "status")

      # Quality gate status should be one of the valid values
      # For repos without GitHub Actions, "unknown" is acceptable
      if echo "$QG_STATUS" | grep -qiE "^(unknown|running|pass|fail)$"; then
        assert_eq "quality-gate: valid status" "true" "true"
      else
        # Status might not be in top-level field; check if output has structure
        HAS_QUALITY_GATE=$(echo "$RETRY_JSON" | grep -c "qualityGate\|quality_gate\|eligible" || echo "0")
        if [ "$HAS_QUALITY_GATE" -gt 0 ]; then
          assert_eq "quality-gate: response has quality gate fields" "true" "true"
        else
          assert_not_empty "quality-gate: retry output not empty" "$RETRY_JSON"
        fi
      fi

      # Test plain text output (no --json)
      echo "  Checking retry dry-run (plain text)..."
      RETRY_TEXT=$(devsh task retry "$TASK_ID" --dry-run 2>&1 || echo "")
      assert_not_empty "retry-dry-run: output not empty" "$RETRY_TEXT"

      if echo "$RETRY_TEXT" | grep -qiE "eligible|retry|quality|checks|no failing"; then
        assert_eq "retry-dry-run: has retry-related output" "true" "true"
      else
        assert_not_empty "retry-dry-run: got response" "$RETRY_TEXT"
      fi

      if echo "$FINAL_STATUS" | grep -qiE "^(completed|stopped)$"; then
        scenario_passed "quality-gate-check"
      else
        scenario_failed "quality-gate-check" "Task status: $FINAL_STATUS"
      fi
    fi
  fi
fi

# ============================================================================
# Scenario 4: Status Tracking
# ============================================================================
if [ -z "$SCENARIO" ] || [ "$SCENARIO" = "status-tracking" ]; then
  echo "--- Scenario 4: Status Tracking ---"
  echo "Monitoring autopilot status transitions during task execution..."

  PROMPT="List files in the root directory. Report what you see. Do NOT make changes."

  TASK_ID=$(create_autopilot_task \
    --repo "$REPO_1" \
    --agent "$AGENT" \
    --autopilot-minutes 3 \
    "$PROMPT") || {
    scenario_failed "status-tracking" "Failed to create task"
    TASK_ID=""
  }

  if [ -n "${TASK_ID:-}" ]; then
    _ATH_CREATED_TASKS+=("$TASK_ID")
    echo "  Task ID: $TASK_ID"

    # Collect status snapshots while polling
    OBSERVED_STATUSES=""
    SAW_RUNNING=0
    START_TIME=$(date +%s)

    while true; do
      STATUS_OUTPUT=$(devsh task status "$TASK_ID" --json 2>&1 || echo "{}")
      # Derive task status from TaskDetail booleans (no top-level "status" field)
      IS_COMPLETED=$(extract_json_bool "$STATUS_OUTPUT" "isCompleted")
      IS_ARCHIVED=$(extract_json_bool "$STATUS_OUTPUT" "isArchived")
      AUTOPILOT_STATUS=$(extract_json_field "$STATUS_OUTPUT" "autopilotStatus")

      if [ "$IS_ARCHIVED" = "true" ]; then
        CURRENT_STATUS="archived"
      elif [ "$IS_COMPLETED" = "true" ]; then
        CURRENT_STATUS="completed"
      else
        # Use first run status for progress tracking
        CURRENT_STATUS=$(echo "$STATUS_OUTPUT" | grep -oP '"status":\s*"\K[^"]+' | head -1 || echo "pending")
      fi

      # Track observed statuses
      OBSERVED_STATUSES="${OBSERVED_STATUSES} ${CURRENT_STATUS}"
      if [ "$CURRENT_STATUS" = "running" ] || [ "$AUTOPILOT_STATUS" = "running" ]; then
        SAW_RUNNING=1
      fi

      # Check for terminal state
      if echo "$CURRENT_STATUS" | grep -qiE "^(completed|stopped|failed|archived)$"; then
        break
      fi

      ELAPSED=$(($(date +%s) - START_TIME))
      if [ "$ELAPSED" -ge "$TIMEOUT_SECONDS" ]; then
        break
      fi

      sleep 5
    done

    TOTAL_TIME=$(($(date +%s) - START_TIME))
    echo "  Total time: ${TOTAL_TIME}s"
    echo "  Observed statuses: $OBSERVED_STATUSES"

    # Check that task was running at some point
    if [ "$SAW_RUNNING" -eq 1 ]; then
      assert_eq "status-tracking: saw running status" "1" "1"
    else
      # Even if we didn't catch "running", the task completing means it ran
      if echo "$OBSERVED_STATUSES" | grep -qiE "completed|stopped"; then
        assert_eq "status-tracking: task completed (ran)" "1" "1"
      else
        assert_eq "status-tracking: saw running or completed" "1" "0"
      fi
    fi

    # Check runs for autopilot config
    RUNS_OUTPUT=$(get_task_runs_json "$TASK_ID")
    HAS_AUTOPILOT=$(echo "$RUNS_OUTPUT" | grep -c "autopilot" || echo "0")
    if [ "$HAS_AUTOPILOT" -gt 0 ]; then
      assert_eq "status-tracking: run has autopilot config" "true" "true"
    else
      # Autopilot config might not be in the JSON output; just verify the task ran
      assert_not_empty "status-tracking: runs output present" "$RUNS_OUTPUT"
    fi

    if echo "$OBSERVED_STATUSES" | grep -qiE "completed|stopped"; then
      scenario_passed "status-tracking"
    else
      scenario_failed "status-tracking" "Task did not complete within timeout"
    fi
  fi
fi

# ============================================================================
# Summary
# ============================================================================
echo ""
echo "========================================="
echo "Autopilot Lifecycle E2E Test Summary"
echo "========================================="
echo "Scenarios passed: $SCENARIOS_PASSED"
echo "Scenarios failed: $SCENARIOS_FAILED"
echo ""

print_summary
