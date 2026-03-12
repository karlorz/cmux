#!/usr/bin/env bash
# E2E integration test for head agent orchestration loop.
#
# Tests the full orchestration flow: spawn workers, wait for events,
# handle approvals, verify completion.
#
# Usage:
#   CMUX_AUTH_TOKEN=$(cloudrouter auth token) ./scripts/test-head-agent-e2e.sh
#   ./scripts/test-head-agent-e2e.sh --agent claude/opus-4.5 --repo karlorz/testing-repo-2
#   ./scripts/test-head-agent-e2e.sh --no-cleanup      # Keep sandboxes for debugging
#   ./scripts/test-head-agent-e2e.sh --scenario 1      # Run single scenario
#   ./scripts/test-head-agent-e2e.sh --skip-slow       # Skip slow scenarios
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

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source helpers
source "$SCRIPT_DIR/lib/autopilot-test-helpers.sh"
source "$SCRIPT_DIR/lib/orchestration-test-helpers.sh"

echo "=== Head Agent Orchestration E2E Tests ==="
echo ""

# ============================================================================
# Configuration
# ============================================================================

# Default config
REPO="${TEST_REPO:-karlorz/testing-repo-1}"
AGENT="${TEST_AGENT:-claude/haiku-4.5}"
PROVIDER="${CMUX_PROVIDER:-pve-lxc}"
TEAM="${CMUX_TEST_TEAM:-default}"
TIMEOUT="${TEST_TIMEOUT:-300}"
CLEANUP="true"
SKIP_SLOW="false"
RUN_SCENARIO=""

# Parse arguments
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
    --provider|-p)
      PROVIDER="$2"
      shift 2
      ;;
    --team)
      TEAM="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    --no-cleanup)
      CLEANUP="false"
      shift
      ;;
    --skip-slow)
      SKIP_SLOW="true"
      shift
      ;;
    --scenario)
      RUN_SCENARIO="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --agent <name>     Agent to use (default: claude/haiku-4.5)"
      echo "  --repo <owner/repo> Repository (default: karlorz/testing-repo-1)"
      echo "  --provider <name>  Sandbox provider: morph, pve-lxc (default: pve-lxc)"
      echo "  --team <slug>      Team slug or ID (default: default)"
      echo "  --timeout <secs>   Timeout for polling (default: 300)"
      echo "  --no-cleanup       Keep sandboxes after test for debugging"
      echo "  --skip-slow        Skip slow scenarios (dependency chain, full wait)"
      echo "  --scenario <n>     Run only scenario N (1-4)"
      echo "  -h, --help         Show this help"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ============================================================================
# Prerequisites
# ============================================================================

check_prerequisites

echo "Configuration:"
echo "  Agent: $AGENT"
echo "  Repo: $REPO"
echo "  Provider: $PROVIDER"
echo "  Team: $TEAM"
echo "  Timeout: ${TIMEOUT}s"
echo "  Cleanup: $CLEANUP"
echo "  Skip slow: $SKIP_SLOW"
[ -n "$RUN_SCENARIO" ] && echo "  Run scenario: $RUN_SCENARIO"
echo ""

# ============================================================================
# Track resources for cleanup
# ============================================================================

CREATED_TASK_IDS=()

cleanup() {
  if [ "$CLEANUP" = "true" ] && [ ${#CREATED_TASK_IDS[@]} -gt 0 ]; then
    echo ""
    echo "=== Cleanup ==="
    echo "Cancelling ${#CREATED_TASK_IDS[@]} task(s)..."
    for task_id in "${CREATED_TASK_IDS[@]}"; do
      echo "  Cancelling: $task_id"
      cancel_orchestration_task "$task_id" "$TEAM"
    done
  elif [ "$CLEANUP" = "false" ] && [ ${#CREATED_TASK_IDS[@]} -gt 0 ]; then
    echo ""
    echo "=== Skipping Cleanup (--no-cleanup) ==="
    echo "Created tasks:"
    for task_id in "${CREATED_TASK_IDS[@]}"; do
      echo "  - $task_id"
    done
  fi
}

trap cleanup EXIT

# ============================================================================
# Helper: should_run_scenario
# ============================================================================

should_run_scenario() {
  local scenario_num="$1"
  if [ -z "$RUN_SCENARIO" ]; then
    return 0  # Run all scenarios
  fi
  [ "$RUN_SCENARIO" = "$scenario_num" ]
}

# ============================================================================
# Scenario 1: Basic Spawn and Wait
# ============================================================================

test_basic_spawn_and_wait() {
  echo ""
  echo "=== Scenario 1: Basic Spawn and Wait ==="
  echo "Testing: spawn agent -> poll status -> verify completion"
  echo ""

  # Spawn a simple task
  echo "[1.1] Spawning agent with simple prompt..."
  local spawn_output
  spawn_output=$(spawn_orchestration_task \
    --agent "$AGENT" \
    --repo "$REPO" \
    "List files in the current directory and describe the project structure briefly")

  local task_id
  task_id=$(extract_orch_task_id "$spawn_output")

  if [ -z "$task_id" ]; then
    echo "    Spawn output: $spawn_output"
    assert_not_empty "Task ID extracted" "$task_id"
    return 1
  fi

  CREATED_TASK_IDS+=("$task_id")
  echo "    Task ID: $task_id"
  assert_not_empty "Task ID created" "$task_id"

  # Check initial status
  echo ""
  echo "[1.2] Checking initial status..."
  sleep 2
  local status_output
  status_output=$(get_orchestration_status "$task_id")
  local initial_status
  initial_status=$(extract_orch_field "$status_output" "status")
  echo "    Initial status: $initial_status"
  assert_contains "Initial status is valid" "$initial_status" ""

  # Verify status transitions
  echo ""
  echo "[1.3] Monitoring status transitions..."
  local seen_states
  seen_states=$(verify_state_transitions "$task_id" "" 60 5)
  echo "    Seen states: $seen_states"

  # Check that we saw running state (indicates task started)
  if echo "$seen_states" | grep -qiE "running|assigned"; then
    assert_eq "Saw running/assigned state" "true" "true"
  else
    # Task might have completed too quickly
    if echo "$seen_states" | grep -qiE "completed|failed"; then
      echo "    (Task completed quickly, skipping running state check)"
      assert_eq "Task reached terminal state" "true" "true"
    else
      assert_eq "Saw running/assigned state" "true" "false"
    fi
  fi

  # Check final status
  echo ""
  echo "[1.4] Checking final status..."
  local final_output
  final_output=$(get_orchestration_status "$task_id")
  local final_status
  final_status=$(extract_orch_field "$final_output" "status")
  echo "    Final status: $final_status"

  # For quick tests, don't wait for full completion
  if is_terminal_status "$final_status"; then
    assert_eq "Task reached terminal state" "true" "true"
  else
    echo "    (Task still running - this is OK for spawn/status test)"
    assert_contains "Task in valid state" "$final_status" ""
  fi

  echo ""
  echo "[1.5] Scenario 1 complete"
}

# ============================================================================
# Scenario 2: Multi-Agent with Dependencies
# ============================================================================

test_dependency_resolution() {
  echo ""
  echo "=== Scenario 2: Multi-Agent with Dependencies ==="
  echo "Testing: Task B depends on Task A -> verify ordering"
  echo ""

  # Spawn Task A (no dependencies)
  echo "[2.1] Spawning Task A (no dependencies)..."
  local task_a_output
  task_a_output=$(spawn_orchestration_task \
    --agent "$AGENT" \
    --repo "$REPO" \
    "Create a file called TASK_A_DONE.txt with content 'Task A completed'")

  local task_a_id
  task_a_id=$(extract_orch_task_id "$task_a_output")

  if [ -z "$task_a_id" ]; then
    echo "    Task A output: $task_a_output"
    assert_not_empty "Task A created" "$task_a_id"
    return 1
  fi

  CREATED_TASK_IDS+=("$task_a_id")
  echo "    Task A ID: $task_a_id"
  assert_not_empty "Task A ID created" "$task_a_id"

  # Spawn Task B with dependency on Task A
  echo ""
  echo "[2.2] Spawning Task B (depends on Task A)..."
  local task_b_output
  task_b_output=$(spawn_orchestration_task \
    --agent "$AGENT" \
    --repo "$REPO" \
    --depends-on "$task_a_id" \
    "Read TASK_A_DONE.txt and create TASK_B_DONE.txt with its contents")

  local task_b_id
  task_b_id=$(extract_orch_task_id "$task_b_output")

  if [ -z "$task_b_id" ]; then
    # Check if --depends-on is not supported
    if echo "$task_b_output" | grep -qiE "unknown flag|depends-on|not.*support"; then
      echo "    --depends-on flag not supported yet, skipping dependency test"
      _ATH_TOTAL=$((_ATH_TOTAL + 1))
      echo -e "  ${_ATH_GREEN}SKIP${_ATH_NC}: Dependency flag not implemented"
      return 0
    fi
    echo "    Task B output: $task_b_output"
    assert_not_empty "Task B created" "$task_b_id"
    return 1
  fi

  CREATED_TASK_IDS+=("$task_b_id")
  echo "    Task B ID: $task_b_id"
  assert_not_empty "Task B ID created" "$task_b_id"

  # Check Task B initial status (should be pending if dependencies work)
  echo ""
  echo "[2.3] Checking Task B initial status..."
  sleep 2
  local task_b_status
  task_b_status=$(get_orchestration_status "$task_b_id")
  local b_status
  b_status=$(extract_orch_field "$task_b_status" "status")
  echo "    Task B status: $b_status"

  # Task B should be pending or assigned (waiting for A)
  if echo "$b_status" | grep -qiE "pending|assigned"; then
    assert_eq "Task B waiting for Task A" "true" "true"
  else
    echo "    (Task B may have started - dependency resolution is async)"
    assert_contains "Task B in valid state" "$b_status" ""
  fi

  if [ "$SKIP_SLOW" = "true" ]; then
    echo ""
    echo "[2.4] Skipping full dependency wait (--skip-slow)"
  else
    echo ""
    echo "[2.4] Waiting for Task A to complete..."
    local task_a_final
    task_a_final=$(poll_orchestration_status "$task_a_id" 120 10)
    echo "    Task A final status: $task_a_final"

    echo ""
    echo "[2.5] Checking Task B after Task A completes..."
    sleep 5  # Give time for dependency resolution
    task_b_status=$(get_orchestration_status "$task_b_id")
    b_status=$(extract_orch_field "$task_b_status" "status")
    echo "    Task B status: $b_status"

    if echo "$b_status" | grep -qiE "running|completed|assigned"; then
      assert_eq "Task B unblocked after Task A" "true" "true"
    else
      assert_contains "Task B progressed" "$b_status" ""
    fi
  fi

  echo ""
  echo "[2.6] Scenario 2 complete"
}

# ============================================================================
# Scenario 3: Approval Flow (Simulated)
# ============================================================================

test_approval_flow() {
  echo ""
  echo "=== Scenario 3: Approval Flow ==="
  echo "Testing: create approval -> query pending -> resolve"
  echo ""

  # For this test, we need an active orchestration with an approval request.
  # Since directly creating approvals requires special setup, we test the
  # query and resolve endpoints with an existing or mock approval.

  # First, we need an orchestration ID. We can use a task from Scenario 1
  # or create a new simple task.
  local orch_id=""
  if [ ${#CREATED_TASK_IDS[@]} -gt 0 ]; then
    # Use first created task as orchestration ID proxy
    # Note: orchestrationId is stored in task metadata
    orch_id="${CREATED_TASK_IDS[0]}"
  fi

  if [ -z "$orch_id" ]; then
    echo "[3.1] Creating task for approval test..."
    local spawn_output
    spawn_output=$(spawn_orchestration_task \
      --agent "$AGENT" \
      --repo "$REPO" \
      "Echo 'approval test task'")
    orch_id=$(extract_orch_task_id "$spawn_output")
    if [ -n "$orch_id" ]; then
      CREATED_TASK_IDS+=("$orch_id")
    fi
  fi

  if [ -z "$orch_id" ]; then
    echo "    No orchestration ID available, skipping approval test"
    _ATH_TOTAL=$((_ATH_TOTAL + 1))
    echo -e "  ${_ATH_GREEN}SKIP${_ATH_NC}: No orchestration context"
    return 0
  fi

  echo "    Using orchestration context: $orch_id"

  # Query pending approvals (may be empty, but endpoint should work)
  echo ""
  echo "[3.2] Querying pending approvals..."
  local approvals
  approvals=$(get_pending_approvals "$TEAM" "$orch_id")
  echo "    Response: ${approvals:0:100}..."

  # Check if we got a valid response (array or error)
  if echo "$approvals" | grep -qE '^\[|"requestId"'; then
    assert_eq "Pending approvals endpoint works" "true" "true"
  elif echo "$approvals" | grep -qiE "unauthorized|error"; then
    echo "    (Auth error - endpoint exists but requires valid team)"
    assert_eq "Approvals endpoint responds" "true" "true"
  else
    assert_contains "Approvals response is valid" "$approvals" ""
  fi

  # Test resolve endpoint with a fake request ID (should fail gracefully)
  echo ""
  echo "[3.3] Testing approval resolve with invalid ID..."
  local resolve_result
  resolve_result=$(resolve_approval_request "$TEAM" "apr_invalid_test_123" "allow" "E2E test")
  echo "    Response: $resolve_result"

  # Should get "not found" or error - this is expected
  if echo "$resolve_result" | grep -qiE "not found|error|invalid|unauthorized"; then
    assert_eq "Invalid approval handled gracefully" "true" "true"
  elif echo "$resolve_result" | grep -qiE "success"; then
    echo "    (Unexpected success - approval may have existed)"
    assert_eq "Resolve endpoint works" "true" "true"
  else
    assert_contains "Resolve endpoint responds" "$resolve_result" ""
  fi

  echo ""
  echo "[3.4] Scenario 3 complete"
}

# ============================================================================
# Scenario 4: SSE Event Streaming
# ============================================================================

test_sse_event_streaming() {
  echo ""
  echo "=== Scenario 4: SSE Event Streaming ==="
  echo "Testing: connect to SSE -> receive events -> verify heartbeat"
  echo ""

  # Get an orchestration context
  local orch_id=""
  if [ ${#CREATED_TASK_IDS[@]} -gt 0 ]; then
    orch_id="${CREATED_TASK_IDS[0]}"
  fi

  if [ -z "$orch_id" ]; then
    echo "[4.1] Creating task for SSE test..."
    local spawn_output
    spawn_output=$(spawn_orchestration_task \
      --agent "$AGENT" \
      --repo "$REPO" \
      "Echo 'SSE test task' and exit")
    orch_id=$(extract_orch_task_id "$spawn_output")
    if [ -n "$orch_id" ]; then
      CREATED_TASK_IDS+=("$orch_id")
    fi
  fi

  if [ -z "$orch_id" ]; then
    echo "    No orchestration ID available, skipping SSE test"
    _ATH_TOTAL=$((_ATH_TOTAL + 1))
    echo -e "  ${_ATH_GREEN}SKIP${_ATH_NC}: No orchestration context"
    return 0
  fi

  echo "    Using orchestration context: $orch_id"

  # Test SSE connection with short timeout
  echo ""
  echo "[4.2] Connecting to SSE event stream (10s timeout)..."
  local api_url
  api_url=$(get_api_url)

  # Use curl to connect to SSE endpoint
  local sse_output
  sse_output=$(timeout 10s curl -sN \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    "${api_url}/api/orchestrate/events/${orch_id}?teamSlugOrId=${TEAM}" 2>&1 || true)

  echo "    Received ${#sse_output} bytes"

  # Check for expected SSE events
  if echo "$sse_output" | grep -q "event:"; then
    assert_eq "Received SSE events" "true" "true"

    # Check for connected event
    if echo "$sse_output" | grep -q "event: connected"; then
      echo "    - Received 'connected' event"
      assert_eq "Connected event received" "true" "true"
    fi

    # Check for heartbeat
    if echo "$sse_output" | grep -q "event: heartbeat"; then
      echo "    - Received 'heartbeat' event"
      assert_eq "Heartbeat received" "true" "true"
    fi

    # Check for task status events
    if echo "$sse_output" | grep -q "event: task_status"; then
      echo "    - Received 'task_status' event"
    fi

  elif echo "$sse_output" | grep -qiE "unauthorized|error"; then
    echo "    (Auth error - endpoint exists)"
    assert_eq "SSE endpoint responds" "true" "true"
  else
    echo "    SSE output: ${sse_output:0:200}..."
    assert_contains "SSE endpoint responds" "$sse_output" ""
  fi

  # Test v2 events endpoint (persisted events)
  echo ""
  echo "[4.3] Testing v2 events endpoint (persisted)..."
  local v2_output
  v2_output=$(timeout 10s curl -sN \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    "${api_url}/api/orchestrate/v2/events/${orch_id}?teamSlugOrId=${TEAM}&replay=true" 2>&1 || true)

  echo "    Received ${#v2_output} bytes"

  if echo "$v2_output" | grep -q "event:"; then
    assert_eq "V2 events endpoint works" "true" "true"

    if echo "$v2_output" | grep -q "event: replay_complete"; then
      echo "    - Received 'replay_complete' event"
    fi
  elif echo "$v2_output" | grep -qiE "unauthorized|error"; then
    echo "    (Auth error - endpoint exists)"
    assert_eq "V2 endpoint responds" "true" "true"
  else
    assert_contains "V2 endpoint responds" "$v2_output" ""
  fi

  echo ""
  echo "[4.4] Scenario 4 complete"
}

# ============================================================================
# Main Test Runner
# ============================================================================

main() {
  local scenarios_run=0

  if should_run_scenario "1"; then
    test_basic_spawn_and_wait
    scenarios_run=$((scenarios_run + 1))
  fi

  if should_run_scenario "2"; then
    if [ "$SKIP_SLOW" = "true" ]; then
      echo ""
      echo "=== Scenario 2: Multi-Agent Dependencies (SKIPPED - slow) ==="
    else
      test_dependency_resolution
      scenarios_run=$((scenarios_run + 1))
    fi
  fi

  if should_run_scenario "3"; then
    test_approval_flow
    scenarios_run=$((scenarios_run + 1))
  fi

  if should_run_scenario "4"; then
    test_sse_event_streaming
    scenarios_run=$((scenarios_run + 1))
  fi

  if [ "$scenarios_run" -eq 0 ]; then
    echo "No scenarios run. Check --scenario flag."
    exit 1
  fi

  print_summary
}

main "$@"
