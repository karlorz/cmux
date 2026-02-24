#!/usr/bin/env bash
# E2E test script for cmux orchestration CLI commands
# Run: ./scripts/test-orchestration.sh
set -euo pipefail

echo "=== cmux Orchestration E2E Tests ==="
echo ""

# Check prerequisites
if ! command -v cmux-devbox &> /dev/null; then
  echo "[SETUP] cmux-devbox not found, building..."
  make install-cmux-devbox-dev
fi

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

pass() { ((PASS_COUNT++)); echo "[PASS] $1"; }
fail() { ((FAIL_COUNT++)); echo "[FAIL] $1"; }
skip() { ((SKIP_COUNT++)); echo "[SKIP] $1"; }

# Test 1: Help command
echo ""
echo "[1/5] Testing orchestrate help command..."
if cmux-devbox orchestrate --help > /dev/null 2>&1; then
  pass "orchestrate --help works"
else
  fail "orchestrate --help failed"
fi

# Test 2: List command (should work even without auth - returns empty or auth error)
echo ""
echo "[2/5] Testing orchestrate list..."
if cmux-devbox orchestrate list 2>&1 | grep -qE "task|error|unauthorized|Error"; then
  pass "orchestrate list responds (auth may be missing)"
else
  fail "orchestrate list failed silently"
fi

# Test 3: Status with invalid ID (should fail gracefully)
echo ""
echo "[3/5] Testing orchestrate status with invalid ID..."
STATUS_OUTPUT=$(cmux-devbox orchestrate status invalid_id_12345 2>&1 || true)
if echo "$STATUS_OUTPUT" | grep -qiE "not found|error|invalid|fail|unauthorized"; then
  pass "invalid ID handled correctly"
else
  echo "    Output: $STATUS_OUTPUT"
  fail "unexpected response for invalid ID"
fi

# Test 4: Cancel with invalid ID (should fail gracefully)
echo ""
echo "[4/5] Testing orchestrate cancel with invalid ID..."
CANCEL_OUTPUT=$(cmux-devbox orchestrate cancel invalid_id_12345 2>&1 || true)
if echo "$CANCEL_OUTPUT" | grep -qiE "not found|error|invalid|fail|unauthorized"; then
  pass "invalid cancel handled correctly"
else
  echo "    Output: $CANCEL_OUTPUT"
  fail "unexpected response for invalid cancel"
fi

# Test 5: Spawn (requires auth - skip in CI if not configured)
echo ""
echo "[5/5] Testing orchestrate spawn (requires auth)..."
if [ -n "${CMUX_AUTH_TOKEN:-}" ]; then
  SPAWN_OUTPUT=$(cmux-devbox orchestrate spawn \
    --agent claude/haiku-4.5 \
    --repo karlorz/testing-repo-1 \
    "Test prompt: list files in current directory" 2>&1 || true)
  if echo "$SPAWN_OUTPUT" | grep -qiE "orchestrationTaskId|taskId|running|success"; then
    pass "spawn succeeded"
  elif echo "$SPAWN_OUTPUT" | grep -qiE "error|fail|unauthorized"; then
    fail "spawn failed: $SPAWN_OUTPUT"
  else
    echo "    Output: $SPAWN_OUTPUT"
    fail "unexpected spawn response"
  fi
else
  skip "CMUX_AUTH_TOKEN not set"
fi

# Summary
echo ""
echo "=== Test Summary ==="
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
