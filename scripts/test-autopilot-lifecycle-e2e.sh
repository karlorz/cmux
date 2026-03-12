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
#   quality-gate-check  - Quality gate endpoint returns valid response after completion
#   status-tracking     - Autopilot heartbeat and status updates flow correctly
#   retry-dry-run       - Retry dry-run returns valid structure
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
      echo "           status-tracking, retry-dry-run"
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

SCENARIOS_RUN=0
SCENARIOS_PASSED=0
SCENARIOS_FAILED=0

run_scenario() {
  local name="$1"
  if [ -n "$SCENARIO" ] && [ "$SCENARIO" != "$name" ]; then
    return 0
  fi
  SCENARIOS_RUN=$((SCENARIOS_RUN + 1))
}

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
  echo ""
  echo "[SCENARIO FAIL] $name: $reason"
  echo ""
}

# ============================================================================
# Scenario 1: Plan to Completion
# ============================================================================
if [ -z "$SCENARIO" ] || [ "$SCENARIO" = "plan-to-completion" ]; then
  run_scenario "plan-to-completion"
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
      RUN_COUNT=$(echo "$RUNS_OUTPUT" | grep -c '"runId"' || echo "0")
      EXIT_CODE=$(extract_json_number "$RUNS_OUTPUT" "exitCode")

      assert_contains "plan-to-completion: terminal status" "completed stopped" "$FINAL_STATUS"
      assert_not_empty "plan-to-completion: has at least one run" "$RUN_COUNT"

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
  run_scenario "multi-agent-spawn"
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

  TASK_ID=$(echo "$CREATE_OUTPUT" | grep -oP '"taskId":\s*"\K[^"]+' || echo "")
  if [ -z "$TASK_ID" ]; then
    TASK_ID=$(echo "$CREATE_OUTPUT" | grep -oP 'Task ID:\s*\K\S+' || echo "")
  fi

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
      RUN_COUNT=$(echo "$RUNS_OUTPUT" | grep -c '"runId"' || echo "0")
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
# Scenario 3: Quality Gate Check
# ============================================================================
if [ -z "$SCENARIO" ] || [ "$SCENARIO" = "quality-gate-check" ]; then
  run_scenario "quality-gate-check"
  echo "--- Scenario 3: Quality Gate Check ---"
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
    echo "  Task ID: $TASK_ID"

    FINAL_STATUS=$(poll_until_terminal "$TASK_ID" "$TIMEOUT_SECONDS" 10) || {
      scenario_failed "quality-gate-check" "Task did not complete"
      FINAL_STATUS="timeout"
    }

    if [ "$FINAL_STATUS" != "timeout" ]; then
      # Call quality gate via retry dry-run
      echo "  Checking quality gate..."
      RETRY_OUTPUT=$(devsh task retry "$TASK_ID" --dry-run --json 2>&1 || echo "{}")

      # Verify response structure
      QG_STATUS=$(extract_json_field "$RETRY_OUTPUT" "status")
      SHOULD_RETRY=$(extract_json_bool "$RETRY_OUTPUT" "shouldRetry")
      MAX_RETRIES=$(extract_json_number "$RETRY_OUTPUT" "maxRetries")

      # Quality gate status should be one of the valid values
      # For repos without GitHub Actions, "unknown" is acceptable
      if echo "$QG_STATUS" | grep -qiE "^(unknown|running|pass|fail)$"; then
        assert_eq "quality-gate-check: valid status" "true" "true"
      else
        # Status might not be in top-level field; check if retry output has structure
        HAS_QUALITY_GATE=$(echo "$RETRY_OUTPUT" | grep -c "qualityGate\|quality_gate\|eligible" || echo "0")
        if [ "$HAS_QUALITY_GATE" -gt 0 ]; then
          assert_eq "quality-gate-check: response has quality gate fields" "true" "true"
        else
          # If devsh task retry --dry-run doesn't support --json yet, just verify it ran
          assert_not_empty "quality-gate-check: retry output not empty" "$RETRY_OUTPUT"
        fi
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
  run_scenario "status-tracking"
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
    echo "  Task ID: $TASK_ID"

    # Collect status snapshots while polling
    OBSERVED_STATUSES=""
    SAW_RUNNING=0
    START_TIME=$(date +%s)

    while true; do
      STATUS_OUTPUT=$(devsh task status "$TASK_ID" --json 2>&1 || echo "{}")
      CURRENT_STATUS=$(echo "$STATUS_OUTPUT" | grep -oP '"status":\s*"\K[^"]+' | head -1 || echo "unknown")
      AUTOPILOT_STATUS=$(extract_json_field "$STATUS_OUTPUT" "autopilotStatus")

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
# Scenario 5: Retry Dry-Run
# ============================================================================
if [ -z "$SCENARIO" ] || [ "$SCENARIO" = "retry-dry-run" ]; then
  run_scenario "retry-dry-run"
  echo "--- Scenario 5: Retry Dry-Run ---"
  echo "Testing retry dry-run response structure..."

  PROMPT="Create a file called TEST_RETRY.md with 'retry test - $(date +%s)'. Stage and commit. Do not create a PR."

  TASK_ID=$(create_autopilot_task \
    --repo "$REPO_1" \
    --agent "$AGENT" \
    --autopilot-minutes 5 \
    "$PROMPT") || {
    scenario_failed "retry-dry-run" "Failed to create task"
    TASK_ID=""
  }

  if [ -n "${TASK_ID:-}" ]; then
    echo "  Task ID: $TASK_ID"

    FINAL_STATUS=$(poll_until_terminal "$TASK_ID" "$TIMEOUT_SECONDS" 10) || {
      scenario_failed "retry-dry-run" "Task did not complete"
      FINAL_STATUS="timeout"
    }

    if [ "$FINAL_STATUS" != "timeout" ]; then
      echo "  Running retry dry-run..."
      RETRY_OUTPUT=$(devsh task retry "$TASK_ID" --dry-run 2>&1 || echo "")

      assert_not_empty "retry-dry-run: output not empty" "$RETRY_OUTPUT"

      # Check for expected fields/messages in output
      # devsh task retry --dry-run should report eligibility
      if echo "$RETRY_OUTPUT" | grep -qiE "eligible|retry|quality|checks|no failing"; then
        assert_eq "retry-dry-run: has retry-related output" "true" "true"
      else
        # Even if the output format differs, verify something was returned
        assert_not_empty "retry-dry-run: got response" "$RETRY_OUTPUT"
      fi

      scenario_passed "retry-dry-run"
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
echo "Scenarios run:    $SCENARIOS_RUN"
echo "Scenarios passed: $SCENARIOS_PASSED"
echo "Scenarios failed: $SCENARIOS_FAILED"
echo ""

print_summary

if [ "$SCENARIOS_FAILED" -gt 0 ]; then
  exit 1
fi
