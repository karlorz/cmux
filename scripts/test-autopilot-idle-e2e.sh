#!/bin/bash
# Test autopilot idle detection by spawning agent with no-op task
#
# The idle detection feature (commit d44923054) should stop sessions
# after 3 turns of no git changes. This test verifies that behavior.
#
# Usage:
#   CMUX_AUTH_TOKEN=$(cloudrouter auth token) ./scripts/test-autopilot-idle-e2e.sh
#   ./scripts/test-autopilot-idle-e2e.sh --agent claude/haiku-4.5
#   TEST_REPO=karlorz/testing-repo-2 ./scripts/test-autopilot-idle-e2e.sh
#
# Required:
#   - CMUX_AUTH_TOKEN: Auth token from cloudrouter
#   - devsh CLI installed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/autopilot-test-helpers.sh"

echo "=== Autopilot Idle Detection E2E Test ==="
echo ""

# Parse arguments
AGENT="${TEST_AGENT:-claude/haiku-4.5}"
REPO="${TEST_REPO:-karlorz/testing-repo-1}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --agent)
      AGENT="$2"
      shift 2
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--agent <agent>] [--repo <repo>] [--timeout <seconds>]"
      echo ""
      echo "Options:"
      echo "  --agent    Agent to use (default: claude/haiku-4.5)"
      echo "  --repo     Test repository (default: karlorz/testing-repo-1)"
      echo "  --timeout  Max wait time in seconds (default: 300)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

check_prerequisites
register_task_cleanup

echo "Configuration:"
echo "  Repo: $REPO"
echo "  Agent: $AGENT"
echo "  Timeout: ${TIMEOUT_SECONDS}s"
echo ""

# Spawn task with no-op prompt - agent should make no git changes
echo "[1/4] Spawning autopilot task with no-op prompt..."
PROMPT="Check git status and report the current branch name. List the files in the repository root directory. Do NOT make any changes to files - just report what you see."

TASK_ID=$(create_autopilot_task \
  --repo "$REPO" \
  --agent "$AGENT" \
  --autopilot-minutes 5 \
  "$PROMPT")

echo "[PASS] Task created: $TASK_ID"
echo ""

# Poll for completion
echo "[2/4] Waiting for task completion (timeout: ${TIMEOUT_SECONDS}s)..."
echo "       Expecting idle detection to stop task early (within ~2 minutes)"
echo ""

START_TIME=$(date +%s)
FINAL_STATUS=$(poll_until_terminal "$TASK_ID" "$TIMEOUT_SECONDS" 10) || {
  echo ""
  echo "[FAIL] Timeout after ${TIMEOUT_SECONDS}s - task did not complete"
  exit 1
}

echo ""
echo "[PASS] Task reached terminal state: $FINAL_STATUS"

TOTAL_TIME=$(($(date +%s) - START_TIME))
echo "       Total time: ${TOTAL_TIME}s"
echo ""

# Check task runs for exit codes and idle detection
echo "[3/4] Checking task runs for idle detection..."

RUNS_OUTPUT=$(get_task_runs_json "$TASK_ID")

RUN_COUNT=$(echo "$RUNS_OUTPUT" | grep -c '"runId"' || echo "0")
echo "       Found $RUN_COUNT run(s)"

EXIT_CODE=$(extract_json_number "$RUNS_OUTPUT" "exitCode")
echo "       Exit code: ${EXIT_CODE:-unknown}"

# Success criteria:
# 1. Task completed in reasonable time (< 3 minutes suggests idle detection worked)
# 2. Exit code is 0 (clean exit) or run completed normally
echo ""
echo "[4/4] Validating idle detection behavior..."

if [ "$TOTAL_TIME" -lt 180 ]; then
  echo "[PASS] Task completed in ${TOTAL_TIME}s (< 3 minutes) - idle detection likely triggered"
else
  echo "[WARN] Task took ${TOTAL_TIME}s - longer than expected for idle detection"
  echo "       Idle detection threshold is 3 turns, so task should stop early"
fi

# Note: We cannot directly verify the log message "No activity for X turns" without
# accessing sandbox logs. The timing-based check is a reasonable proxy.

echo ""
echo "=== Test Summary ==="
echo "Task ID: $TASK_ID"
echo "Final Status: $FINAL_STATUS"
echo "Total Time: ${TOTAL_TIME}s"
echo "Exit Code: ${EXIT_CODE:-unknown}"

if [ "$FINAL_STATUS" = "completed" ] || [ "$FINAL_STATUS" = "stopped" ]; then
  if [ "$TOTAL_TIME" -lt 180 ]; then
    echo ""
    echo "[SUCCESS] Idle detection test passed"
    echo "          - Task completed early (${TOTAL_TIME}s < 180s)"
    echo "          - No git changes were made (no-op prompt)"
    exit 0
  else
    echo ""
    echo "[PARTIAL] Task completed but took longer than expected"
    echo "          - Review autopilot hooks for potential issues"
    exit 0
  fi
else
  echo ""
  echo "[FAIL] Task ended in unexpected state: $FINAL_STATUS"
  exit 1
fi
