#!/bin/bash
# Shared test utilities for orchestration E2E tests.
#
# Source this file from test scripts:
#   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
#   source "$SCRIPT_DIR/lib/orchestration-test-helpers.sh"
#
# Provides:
#   - Spawn helpers: spawn_orchestration_task, spawn_head_agent
#   - Status helpers: poll_orchestration_status, get_orchestration_status
#   - Event helpers: wait_for_sse_event, get_orchestration_events
#   - Approval helpers: create_approval_request, resolve_approval_request
#   - JSON helpers: extract_orch_field, extract_orch_task_id

# Note: This file expects autopilot-test-helpers.sh to be sourced first
# for assert_* functions and counters

# ============================================================================
# Constants
# ============================================================================

_OTH_DEFAULT_TIMEOUT=300
_OTH_DEFAULT_POLL_INTERVAL=5

# ============================================================================
# Spawn Helpers
# ============================================================================

# Spawn an orchestration task. Prints JSON output to stdout.
# Usage: OUTPUT=$(spawn_orchestration_task --agent <agent> --repo <repo> "<prompt>")
spawn_orchestration_task() {
  local output
  output=$(devsh orchestrate spawn --json "$@" 2>&1 || true)
  echo "$output"
}

# Extract task ID from spawn output
# Usage: TASK_ID=$(extract_orch_task_id "$output")
extract_orch_task_id() {
  local output="$1"
  echo "$output" | grep -oP '"orchestrationTaskId":\s*"\K[^"]+' | head -1 || echo ""
}

# Spawn an orchestration head agent (cloud workspace).
# Usage: OUTPUT=$(spawn_head_agent --agent <agent> --repo <repo> "<prompt>")
spawn_head_agent() {
  spawn_orchestration_task --cloud-workspace "$@"
}

# ============================================================================
# Status Helpers
# ============================================================================

# Get orchestration task status. Prints JSON output to stdout.
# Usage: STATUS=$(get_orchestration_status "$task_id")
get_orchestration_status() {
  local task_id="$1"
  devsh orchestrate status "$task_id" --json 2>&1 || echo "{}"
}

# Extract status field from orchestration status output.
# Usage: STATUS=$(extract_orch_field "$json" "status")
extract_orch_field() {
  local json="$1" field="$2"
  echo "$json" | grep -oP "\"${field}\":\s*\"\K[^\"]*" | head -1 || echo ""
}

# Poll orchestration task until terminal state. Prints final status to stdout.
# Args: <task_id> [timeout_seconds] [poll_interval_seconds]
poll_orchestration_status() {
  local task_id="$1"
  local timeout="${2:-$_OTH_DEFAULT_TIMEOUT}"
  local interval="${3:-$_OTH_DEFAULT_POLL_INTERVAL}"
  local start_time current_status last_status elapsed status_output

  start_time=$(date +%s)
  last_status=""

  while true; do
    status_output=$(get_orchestration_status "$task_id")
    current_status=$(extract_orch_field "$status_output" "status")

    # Default to pending if no status found
    if [ -z "$current_status" ]; then
      current_status="pending"
    fi

    if [ "$current_status" != "$last_status" ]; then
      elapsed=$(( $(date +%s) - start_time ))
      echo "  [${elapsed}s] Status: $current_status" >&2
      last_status="$current_status"
    fi

    # Check for terminal states
    if echo "$current_status" | grep -qiE "^(completed|failed|cancelled)$"; then
      echo "$current_status"
      return 0
    fi

    elapsed=$(( $(date +%s) - start_time ))
    if [ "$elapsed" -ge "$timeout" ]; then
      echo "  [TIMEOUT] after ${timeout}s" >&2
      echo "$current_status"
      return 1
    fi

    sleep "$interval"
  done
}

# Wait for orchestration task using devsh CLI (built-in wait with timeout)
# Usage: wait_orchestration_task "$task_id" "60s"
wait_orchestration_task() {
  local task_id="$1"
  local timeout="${2:-300s}"
  devsh orchestrate wait "$task_id" --timeout "$timeout" --json 2>&1 || true
}

# ============================================================================
# Event Helpers (SSE)
# ============================================================================

# Stream SSE events and capture specific event type. Returns first matching event.
# Usage: EVENT=$(wait_for_sse_event "$orch_id" "$team" "task_completed" 30)
# Note: This is a simplified version - actual SSE streaming is complex in bash.
wait_for_sse_event() {
  local orch_id="$1"
  local team="$2"
  local event_type="$3"
  local timeout="${4:-30}"
  local api_url="${CMUX_API_URL:-https://cmux-www.karldigi.dev}"

  # Use curl with timeout to fetch SSE stream
  # Note: This captures all output until timeout or connection close
  local output
  output=$(timeout "${timeout}s" curl -sN \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    "${api_url}/api/orchestrate/events/${orch_id}?teamSlugOrId=${team}" 2>&1 || true)

  # Look for the event type in the output
  if echo "$output" | grep -q "event: ${event_type}"; then
    # Extract the data line following the event
    echo "$output" | grep -A1 "event: ${event_type}" | grep "^data:" | head -1 | sed 's/^data://'
  else
    echo ""
  fi
}

# Get orchestration events from v2 endpoint (persisted events).
# Usage: EVENTS=$(get_orchestration_events "$orch_id" "$team")
get_orchestration_events() {
  local orch_id="$1"
  local team="$2"
  local api_url="${CMUX_API_URL:-https://cmux-www.karldigi.dev}"

  # Fetch events with replay=true to get all historical events
  local output
  output=$(timeout 10s curl -sN \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    "${api_url}/api/orchestrate/v2/events/${orch_id}?teamSlugOrId=${team}&replay=true" 2>&1 || true)

  echo "$output"
}

# ============================================================================
# Approval Helpers
# ============================================================================

# Create an approval request via API.
# Usage: RESULT=$(create_approval_request "$team" "$orch_id" "$action" "$context_json")
create_approval_request() {
  local team="$1"
  local orch_id="$2"
  local action="$3"
  local agent_name="${4:-test-agent}"
  local api_url="${CMUX_API_URL:-https://cmux-www.karldigi.dev}"

  # Note: The API requires authenticated user, so we use the Convex approach
  # via curl POST. For testing, we might need a direct Convex call or mock.
  # This is a placeholder - actual implementation depends on available endpoints.
  echo '{"info": "Direct approval creation requires Convex mutation - use test via orchestrate spawn"}'
}

# Get pending approvals for an orchestration.
# Usage: APPROVALS=$(get_pending_approvals "$team" "$orch_id")
get_pending_approvals() {
  local team="$1"
  local orch_id="$2"
  local api_url="${CMUX_API_URL:-https://cmux-www.karldigi.dev}"

  curl -s \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    "${api_url}/api/orchestrate/approvals/${orch_id}/pending?teamSlugOrId=${team}" 2>&1 || echo "[]"
}

# Resolve an approval request.
# Usage: RESULT=$(resolve_approval_request "$team" "$request_id" "allow")
resolve_approval_request() {
  local team="$1"
  local request_id="$2"
  local resolution="${3:-allow}"
  local note="${4:-E2E test resolution}"
  local api_url="${CMUX_API_URL:-https://cmux-www.karldigi.dev}"

  curl -s \
    -X POST \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"teamSlugOrId\": \"${team}\", \"resolution\": \"${resolution}\", \"note\": \"${note}\"}" \
    "${api_url}/api/orchestrate/approvals/${request_id}/resolve" 2>&1 || echo '{"success": false}'
}

# ============================================================================
# Cleanup Helpers
# ============================================================================

# Cancel orchestration task.
# Usage: cancel_orchestration_task "$task_id" "$team"
cancel_orchestration_task() {
  local task_id="$1"
  local team="$2"
  devsh orchestrate cancel "$task_id" 2>/dev/null || true
}

# Cancel multiple orchestration tasks.
# Usage: cancel_orchestration_tasks "${TASK_IDS[@]}"
cancel_orchestration_tasks() {
  local task_ids=("$@")
  for task_id in "${task_ids[@]}"; do
    echo "  Cancelling: $task_id" >&2
    devsh orchestrate cancel "$task_id" 2>/dev/null || true
  done
}

# ============================================================================
# Validation Helpers
# ============================================================================

# Verify task transitions through expected states.
# Usage: verify_state_transitions "$task_id" "pending,running,completed"
verify_state_transitions() {
  local task_id="$1"
  local expected_states="$2"
  local timeout="${3:-60}"
  local interval="${4:-3}"
  local start_time elapsed
  local seen_states=""
  local current_status

  start_time=$(date +%s)

  while true; do
    local status_output
    status_output=$(get_orchestration_status "$task_id")
    current_status=$(extract_orch_field "$status_output" "status")

    # Track seen states
    if [ -n "$current_status" ] && ! echo "$seen_states" | grep -q "$current_status"; then
      if [ -n "$seen_states" ]; then
        seen_states="${seen_states},${current_status}"
      else
        seen_states="$current_status"
      fi
    fi

    # Check for terminal state
    if echo "$current_status" | grep -qiE "^(completed|failed|cancelled)$"; then
      break
    fi

    elapsed=$(( $(date +%s) - start_time ))
    if [ "$elapsed" -ge "$timeout" ]; then
      echo "timeout" >&2
      break
    fi

    sleep "$interval"
  done

  echo "$seen_states"
}

# Check if task status is in expected terminal state.
# Usage: is_terminal_status "$status"
is_terminal_status() {
  local status="$1"
  echo "$status" | grep -qiE "^(completed|failed|cancelled)$"
}

# ============================================================================
# Multi-Agent Helpers
# ============================================================================

# Spawn task with dependency on another task.
# Usage: spawn_dependent_task "$depends_on_id" --agent <agent> --repo <repo> "<prompt>"
spawn_dependent_task() {
  local depends_on="$1"
  shift
  spawn_orchestration_task --depends-on "$depends_on" "$@"
}

# Get dependency info for a task.
# Usage: get_dependency_info "$task_id"
get_dependency_info() {
  local task_id="$1"
  local status_output
  status_output=$(get_orchestration_status "$task_id")

  # Extract dependencyInfo if present
  echo "$status_output" | grep -oP '"dependencies":\s*\[\K[^\]]*' | head -1 || echo ""
}

# ============================================================================
# API Helpers
# ============================================================================

# Get API URL from environment or default
get_api_url() {
  echo "${CMUX_API_URL:-https://cmux-www.karldigi.dev}"
}

# Get team slug from environment or default
get_test_team() {
  echo "${CMUX_TEST_TEAM:-default}"
}

# Make authenticated API request.
# Usage: api_get "/orchestrate/tasks?teamSlugOrId=team"
api_get() {
  local path="$1"
  local api_url
  api_url=$(get_api_url)

  curl -s \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    "${api_url}/api${path}" 2>&1 || echo '{"error": "request failed"}'
}

# Make authenticated POST request.
# Usage: api_post "/orchestrate/tasks/123/cancel" '{"teamSlugOrId": "team"}'
api_post() {
  local path="$1"
  local body="$2"
  local api_url
  api_url=$(get_api_url)

  curl -s \
    -X POST \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${api_url}/api${path}" 2>&1 || echo '{"error": "request failed"}'
}
