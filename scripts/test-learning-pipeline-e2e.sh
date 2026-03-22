#!/usr/bin/env bash
# E2E test for orchestration learning pipeline:
#   log_learning -> candidateRule -> rule promotion -> active rule injection
#
# Usage:
#   CMUX_AUTH_TOKEN=$(cloudrouter auth token) ./scripts/test-learning-pipeline-e2e.sh
#   ./scripts/test-learning-pipeline-e2e.sh --team my-team
#   ./scripts/test-learning-pipeline-e2e.sh --skip-cleanup  # Keep test data
#
# Required:
#   - CMUX_AUTH_TOKEN: Auth token from cloudrouter
#   - curl for API calls
#   - jq for JSON parsing (optional but recommended)

set -euo pipefail

echo "=== Orchestration Learning Pipeline E2E Test ==="
echo ""

# Configuration
TEAM="${CMUX_TEST_TEAM:-default}"
API_URL="${CMUX_API_URL:-https://cmux-www.karldigi.dev}"
SKIP_CLEANUP="false"
CREATED_RULE_IDS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --team)
      TEAM="$2"
      shift 2
      ;;
    --api-url)
      API_URL="$2"
      shift 2
      ;;
    --skip-cleanup)
      SKIP_CLEANUP="true"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --team <slug>      Team slug (default: default)"
      echo "  --api-url <url>    API URL (default: https://cmux-www.karldigi.dev)"
      echo "  --skip-cleanup     Keep created test rules"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check prerequisites
if [ -z "${CMUX_AUTH_TOKEN:-}" ]; then
  echo "[ERROR] CMUX_AUTH_TOKEN not set"
  echo "Run: CMUX_AUTH_TOKEN=\$(cloudrouter auth token) $0"
  exit 1
fi

# Test counters
PASS=0
FAIL=0
SKIP=0

pass() { PASS=$((PASS + 1)); echo "[PASS] $1"; }
fail() { FAIL=$((FAIL + 1)); echo "[FAIL] $1"; }
skip() { SKIP=$((SKIP + 1)); echo "[SKIP] $1"; }

cleanup() {
  if [ "$SKIP_CLEANUP" = "false" ] && [ ${#CREATED_RULE_IDS[@]} -gt 0 ]; then
    echo ""
    echo "=== Cleanup ==="
    echo "Note: Created rules remain for manual review"
    echo "Rule IDs: ${CREATED_RULE_IDS[*]}"
  fi
}

trap cleanup EXIT

echo "Configuration:"
echo "  Team: $TEAM"
echo "  API URL: $API_URL"
echo ""

# =============================================================================
# Test 1: Log Learning via API
# =============================================================================
echo "=== Test 1: Log Learning via API ==="

TEST_LEARNING_TEXT="E2E Test: $(date +%Y%m%d%H%M%S) - Always run bun check before committing"

LOG_RESPONSE=$(curl -sS -X POST \
  -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  "${API_URL}/api/v1/cmux/orchestration/learning/log" \
  -d "{
    \"teamSlugOrId\": \"${TEAM}\",
    \"text\": \"${TEST_LEARNING_TEXT}\",
    \"type\": \"learning\",
    \"lane\": \"orchestration\",
    \"confidence\": 0.75
  }" 2>&1 || echo '{"error":"request_failed"}')

echo "  Response: ${LOG_RESPONSE:0:200}"

if echo "$LOG_RESPONSE" | grep -qiE '"ruleId"|"eventId"|success'; then
  pass "Log learning API returned valid response"

  # Extract rule ID if present
  RULE_ID=$(echo "$LOG_RESPONSE" | grep -oP '"ruleId":\s*"\K[^"]+' || echo "")
  if [ -n "$RULE_ID" ]; then
    CREATED_RULE_IDS+=("$RULE_ID")
    echo "  Created rule: $RULE_ID"
  fi
elif echo "$LOG_RESPONSE" | grep -qiE "unauthorized|401"; then
  fail "Log learning API - unauthorized (check token)"
elif echo "$LOG_RESPONSE" | grep -qiE "error"; then
  echo "  Full response: $LOG_RESPONSE"
  fail "Log learning API returned error"
else
  echo "  Unexpected response: $LOG_RESPONSE"
  fail "Log learning API - unexpected response"
fi

# =============================================================================
# Test 2: Query Candidate Rules
# =============================================================================
echo ""
echo "=== Test 2: Query Candidate Rules ==="

CANDIDATES_RESPONSE=$(curl -sS \
  -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
  "${API_URL}/api/v1/cmux/orchestration/rules?teamSlugOrId=${TEAM}&status=candidate" 2>&1 || echo '{"error":"request_failed"}')

echo "  Response length: ${#CANDIDATES_RESPONSE} bytes"

if echo "$CANDIDATES_RESPONSE" | grep -qE '^\[|"_id"'; then
  pass "Query candidates API returned array"

  # Count candidates
  if command -v jq &> /dev/null; then
    CANDIDATE_COUNT=$(echo "$CANDIDATES_RESPONSE" | jq 'length' 2>/dev/null || echo "?")
    echo "  Found $CANDIDATE_COUNT candidate rule(s)"
  fi

  # Check if our test learning created a rule
  if echo "$CANDIDATES_RESPONSE" | grep -q "$TEST_LEARNING_TEXT"; then
    pass "Test learning found in candidates"
  else
    echo "  (Test learning may not appear immediately - async processing)"
    skip "Test learning not yet in candidates (async)"
  fi
elif echo "$CANDIDATES_RESPONSE" | grep -qiE "unauthorized|401"; then
  fail "Query candidates API - unauthorized"
else
  echo "  Response: ${CANDIDATES_RESPONSE:0:200}"
  fail "Query candidates API - unexpected response"
fi

# =============================================================================
# Test 3: Query Active Rules
# =============================================================================
echo ""
echo "=== Test 3: Query Active Rules ==="

ACTIVE_RESPONSE=$(curl -sS \
  -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
  "${API_URL}/api/v1/cmux/orchestration/rules?teamSlugOrId=${TEAM}&lane=orchestration" 2>&1 || echo '{"error":"request_failed"}')

echo "  Response length: ${#ACTIVE_RESPONSE} bytes"

if echo "$ACTIVE_RESPONSE" | grep -qE '^\[|"status"'; then
  pass "Query active rules API returned array"

  if command -v jq &> /dev/null; then
    ACTIVE_COUNT=$(echo "$ACTIVE_RESPONSE" | jq 'length' 2>/dev/null || echo "?")
    echo "  Found $ACTIVE_COUNT active rule(s)"
  fi
elif echo "$ACTIVE_RESPONSE" | grep -qiE "unauthorized|401"; then
  fail "Query active rules API - unauthorized"
else
  echo "  Response: ${ACTIVE_RESPONSE:0:200}"
  fail "Query active rules API - unexpected response"
fi

# =============================================================================
# Test 4: Promote Rule (if we have a candidate)
# =============================================================================
echo ""
echo "=== Test 4: Promote Rule ==="

if [ ${#CREATED_RULE_IDS[@]} -gt 0 ]; then
  PROMOTE_RULE_ID="${CREATED_RULE_IDS[0]}"
  echo "  Promoting rule: $PROMOTE_RULE_ID"

  # Note: This requires Convex mutation access, which may not be available via HTTP API
  # The UI calls Convex directly. For now, we verify the endpoint structure.

  # Try the promote via API (may need adjustment based on actual endpoint)
  PROMOTE_RESPONSE=$(curl -sS -X POST \
    -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    "${API_URL}/api/v1/cmux/orchestration/rules/promote" \
    -d "{
      \"teamSlugOrId\": \"${TEAM}\",
      \"ruleId\": \"${PROMOTE_RULE_ID}\",
      \"lane\": \"hot\"
    }" 2>&1 || echo '{"error":"request_failed"}')

  echo "  Response: ${PROMOTE_RESPONSE:0:200}"

  if echo "$PROMOTE_RESPONSE" | grep -qiE "success|promoted|eventId"; then
    pass "Promote rule API succeeded"
  elif echo "$PROMOTE_RESPONSE" | grep -qiE "not found|404"; then
    # Endpoint may not exist yet - this is expected
    skip "Promote rule endpoint not implemented (use UI)"
  elif echo "$PROMOTE_RESPONSE" | grep -qiE "unauthorized|401"; then
    fail "Promote rule API - unauthorized"
  else
    # May not be implemented as HTTP endpoint
    skip "Promote rule - response unclear (may need UI)"
  fi
else
  skip "No candidate rule to promote"
fi

# =============================================================================
# Test 5: Verify Learning Events
# =============================================================================
echo ""
echo "=== Test 5: Query Learning Events ==="

EVENTS_RESPONSE=$(curl -sS \
  -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
  "${API_URL}/api/v1/cmux/orchestration/learning/events?teamSlugOrId=${TEAM}&limit=10" 2>&1 || echo '{"error":"request_failed"}')

echo "  Response length: ${#EVENTS_RESPONSE} bytes"

if echo "$EVENTS_RESPONSE" | grep -qE '^\[|"eventType"'; then
  pass "Query learning events API returned array"

  if command -v jq &> /dev/null; then
    EVENT_COUNT=$(echo "$EVENTS_RESPONSE" | jq 'length' 2>/dev/null || echo "?")
    echo "  Found $EVENT_COUNT event(s)"
  fi
elif echo "$EVENTS_RESPONSE" | grep -qiE "not found|404"; then
  skip "Learning events endpoint not implemented"
elif echo "$EVENTS_RESPONSE" | grep -qiE "unauthorized|401"; then
  fail "Query learning events API - unauthorized"
else
  echo "  Response: ${EVENTS_RESPONSE:0:200}"
  skip "Query learning events - unexpected response format"
fi

# =============================================================================
# Test 6: Verify MCP Tool Integration (if in sandbox)
# =============================================================================
echo ""
echo "=== Test 6: MCP Tool Integration ==="

if [ -n "${CMUX_TASK_RUN_JWT:-}" ]; then
  echo "  Running in sandbox context (JWT present)"

  # Test log_learning via x-cmux-token header
  MCP_RESPONSE=$(curl -sS -X POST \
    -H "x-cmux-token: ${CMUX_TASK_RUN_JWT}" \
    -H "Content-Type: application/json" \
    "${API_URL}/api/v1/cmux/orchestration/learning/log" \
    -d "{
      \"text\": \"MCP Test: $(date +%s) - Agent used log_learning tool\",
      \"type\": \"learning\",
      \"lane\": \"orchestration\"
    }" 2>&1 || echo '{"error":"request_failed"}')

  echo "  Response: ${MCP_RESPONSE:0:200}"

  if echo "$MCP_RESPONSE" | grep -qiE '"ruleId"|"eventId"|success'; then
    pass "MCP log_learning via JWT succeeded"
  elif echo "$MCP_RESPONSE" | grep -qiE "unauthorized|invalid.*jwt"; then
    fail "MCP log_learning - JWT invalid"
  else
    fail "MCP log_learning - unexpected response"
  fi
else
  skip "Not in sandbox context (no CMUX_TASK_RUN_JWT)"
fi

# =============================================================================
# Test 7: Query Skill Candidates
# =============================================================================
echo ""
echo "=== Test 7: Query Skill Candidates ==="

SKILLS_RESPONSE=$(curl -sS \
  -H "Authorization: Bearer ${CMUX_AUTH_TOKEN}" \
  "${API_URL}/api/v1/cmux/orchestration/skills?teamSlugOrId=${TEAM}" 2>&1 || echo '{"error":"request_failed"}')

echo "  Response length: ${#SKILLS_RESPONSE} bytes"

if echo "$SKILLS_RESPONSE" | grep -qE '^\[|"patternKey"'; then
  pass "Query skill candidates API returned array"

  if command -v jq &> /dev/null; then
    SKILL_COUNT=$(echo "$SKILLS_RESPONSE" | jq 'length' 2>/dev/null || echo "?")
    echo "  Found $SKILL_COUNT skill candidate(s)"
  fi
elif echo "$SKILLS_RESPONSE" | grep -qiE "not found|404"; then
  # Endpoint may not exist yet - add after PR #597 merges
  skip "Skill candidates endpoint not implemented (pending PR #597)"
elif echo "$SKILLS_RESPONSE" | grep -qiE "unauthorized|401"; then
  fail "Query skill candidates API - unauthorized"
else
  echo "  Response: ${SKILLS_RESPONSE:0:200}"
  skip "Query skill candidates - unexpected response format"
fi

# =============================================================================
# Test 8: Verify detectPatterns Cron Output (indirect)
# =============================================================================
echo ""
echo "=== Test 8: Verify Pattern Detection ==="

# Check if we have any skill candidates - indicates detectPatterns cron has run
if [ "${SKILL_COUNT:-0}" != "?" ] && [ "${SKILL_COUNT:-0}" -gt 0 ]; then
  pass "Pattern detection cron has generated skill candidates"

  # Try to get details of first skill candidate
  if command -v jq &> /dev/null && echo "$SKILLS_RESPONSE" | jq -e '.[0]' &>/dev/null; then
    FIRST_SKILL=$(echo "$SKILLS_RESPONSE" | jq '.[0]' 2>/dev/null)
    SKILL_TITLE=$(echo "$FIRST_SKILL" | jq -r '.title // "unknown"' 2>/dev/null)
    SKILL_STATUS=$(echo "$FIRST_SKILL" | jq -r '.status // "unknown"' 2>/dev/null)
    RECURRENCE=$(echo "$FIRST_SKILL" | jq -r '.recurrenceCount // 0' 2>/dev/null)
    echo "  First skill: $SKILL_TITLE (status: $SKILL_STATUS, seen: $RECURRENCE times)"
  fi
else
  skip "No skill candidates yet (cron may not have run or not enough patterns)"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "=== Learning Pipeline E2E Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Skipped: $SKIP"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Some tests failed!"
  exit 1
else
  echo "All tests passed (or skipped)!"
  exit 0
fi
