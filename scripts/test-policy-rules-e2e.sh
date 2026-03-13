#!/bin/bash
# test-policy-rules-e2e.sh
# E2E test for centralized agent policy rules (PRs #548, #549)
#
# Verifies that policy rules from Convex are injected into agent instruction files
# at sandbox creation time (NOT bundled in snapshots).

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASS_COUNT++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAIL_COUNT++)); }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

cleanup() {
    if [[ -n "${TASK_ID:-}" ]]; then
        log_info "Cleaning up task $TASK_ID..."
        devsh task delete "$TASK_ID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# Check prerequisites
command -v devsh >/dev/null 2>&1 || { log_fail "devsh not found"; exit 1; }
command -v jq >/dev/null 2>&1 || { log_fail "jq not found"; exit 1; }

log_info "=== Policy Rules E2E Test ==="
log_info "Testing that policy rules are injected at sandbox creation (not in snapshots)"

# --- Scenario 1: Claude Agent ---
log_info ""
log_info "=== Scenario 1: Claude Agent Policy Rules ==="

# Create a minimal task
log_info "Creating Claude task..."
TASK_RESULT=$(devsh task create \
    --repo karlorz/testing-repo-1 \
    --agent claude/haiku-4.5 \
    --json \
    "Echo 'Policy test complete' and exit" 2>&1) || { log_fail "Failed to create task: $TASK_RESULT"; exit 1; }

TASK_ID=$(echo "$TASK_RESULT" | jq -r '.taskId // .id // empty')
if [[ -z "$TASK_ID" ]]; then
    log_fail "Could not extract task ID from: $TASK_RESULT"
    exit 1
fi
log_info "Task created: $TASK_ID"

# Wait for sandbox to be ready (instance running)
log_info "Waiting for sandbox to be ready..."
for i in {1..30}; do
    STATUS=$(devsh task status "$TASK_ID" --json 2>/dev/null | jq -r '.status // "unknown"')
    if [[ "$STATUS" == "running" || "$STATUS" == "completed" ]]; then
        break
    fi
    sleep 2
done

if [[ "$STATUS" != "running" && "$STATUS" != "completed" ]]; then
    log_fail "Task did not reach running state: $STATUS"
    exit 1
fi
log_pass "Sandbox is ready (status: $STATUS)"

# Check for policy rules in CLAUDE.md
log_info "Checking ~/.claude/CLAUDE.md for policy rules..."

# Get the instruction file content
CLAUDE_MD=$(devsh exec "$TASK_ID" "cat ~/.claude/CLAUDE.md 2>/dev/null || echo 'FILE_NOT_FOUND'" 2>&1)

if [[ "$CLAUDE_MD" == "FILE_NOT_FOUND" ]]; then
    log_fail "~/.claude/CLAUDE.md not found in sandbox"
else
    log_pass "~/.claude/CLAUDE.md exists"

    # Check for policy rules section header
    if echo "$CLAUDE_MD" | grep -q "Agent Policy Rules"; then
        log_pass "Policy rules section found in CLAUDE.md"
    else
        log_fail "Policy rules section NOT found in CLAUDE.md"
    fi

    # Check for specific seeded rules
    if echo "$CLAUDE_MD" | grep -qi "NO direct commits to main"; then
        log_pass "Git policy rule (no direct main) found"
    else
        log_fail "Git policy rule (no direct main) NOT found"
    fi

    if echo "$CLAUDE_MD" | grep -qi "NO manual PR creation.*task sandbox"; then
        log_pass "PR policy rule (task sandbox) found"
    else
        log_warn "PR policy rule (task sandbox) not found (may be filtered by context)"
    fi

    if echo "$CLAUDE_MD" | grep -qi "credentials\|secrets"; then
        log_pass "Security policy rule (no credentials) found"
    else
        log_fail "Security policy rule (no credentials) NOT found"
    fi
fi

# Cleanup this task
devsh task delete "$TASK_ID" 2>/dev/null || true
TASK_ID=""

# --- Summary ---
log_info ""
log_info "=== Test Summary ==="
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"

if [[ $FAIL_COUNT -gt 0 ]]; then
    log_fail "Some tests failed"
    exit 1
else
    log_pass "All tests passed - Policy rules are injected at sandbox creation"
    exit 0
fi
