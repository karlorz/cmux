#!/bin/bash
# Runs codex code review and outputs only the findings

set -euo pipefail

# Debug log file
DEBUG_LOG="/tmp/codex-review-debug.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] === codex-review.sh START ===" >> "$DEBUG_LOG"
echo "CODEX_REVIEW_DISABLED=${CODEX_REVIEW_DISABLED:-}" >> "$DEBUG_LOG"
echo "CLAUDE_AUTOPILOT=${CLAUDE_AUTOPILOT:-}" >> "$DEBUG_LOG"

# Skip if disabled via env var
if [ "${CODEX_REVIEW_DISABLED:-}" = "1" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Exiting: CODEX_REVIEW_DISABLED=1" >> "$DEBUG_LOG"
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Read session_id from hook stdin JSON
INPUT=$(cat)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INPUT JSON: $INPUT" >> "$DEBUG_LOG"

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
echo "[$(date '+%Y-%m-%d %H:%M:%S')] SESSION_ID: $SESSION_ID" >> "$DEBUG_LOG"

# Skip if autopilot blocked this stop (another hook already issued a block decision).
# This avoids running a slow review on every autopilot turn, but still allows
# the review to run on the final stop when autopilot permits it through.
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
echo "[$(date '+%Y-%m-%d %H:%M:%S')] STOP_HOOK_ACTIVE: $STOP_HOOK_ACTIVE" >> "$DEBUG_LOG"

if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Exiting: stop_hook_active=true (autopilot blocked)" >> "$DEBUG_LOG"
  exit 0
fi
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Proceeding with codex review..." >> "$DEBUG_LOG"

# Hard stop after 5 failures to prevent excessive loops (per session)
FAIL_COUNT_FILE="/tmp/codex-review-fails-${SESSION_ID}"
FAIL_COUNT=0
if [ -f "$FAIL_COUNT_FILE" ]; then
  FAIL_COUNT=$(cat "$FAIL_COUNT_FILE")
fi
if [ "$FAIL_COUNT" -ge 5 ]; then
  exit 0  # Hit limit, stop showing issues
fi

# Create temp file for output
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

# REVIEW.md guidelines are loaded via AGENTS.md (codex reads it automatically).
# --base and [PROMPT] are mutually exclusive, so we cannot pass a custom prompt here.
# --enable use_linux_sandbox_bwrap avoids Landlock restrictions in containerized environments.
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running codex review..." >> "$DEBUG_LOG"
unbuffer codex \
  --dangerously-bypass-approvals-and-sandbox \
  --enable use_linux_sandbox_bwrap \
  --model gpt-5.3-codex \
  -c model_reasoning_effort="low" \
  review --base main > "$TMPFILE" 2>&1 || true
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Codex review finished, TMPFILE contents:" >> "$DEBUG_LOG"
head -100 "$TMPFILE" >> "$DEBUG_LOG" 2>/dev/null || echo "(empty)" >> "$DEBUG_LOG"

# Strip ANSI codes first, then extract final codex response
CLEAN=$(sed 's/\x1b\[[0-9;]*m//g' "$TMPFILE")

# Extract just the final codex response (after the last "codex" marker)
FINDINGS=$(echo "$CLEAN" | awk '
  /^codex$/ { found=1; content=""; next }
  found { content = content $0 "\n" }
  END { print content }
' | sed '/^$/d' | grep -v '^tokens used' | head -50)

if [ -z "$FINDINGS" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] No FINDINGS extracted, exiting" >> "$DEBUG_LOG"
  exit 0  # No output from codex
fi
echo "[$(date '+%Y-%m-%d %H:%M:%S')] FINDINGS: $FINDINGS" >> "$DEBUG_LOG"

# Use opencode to check if review passed (lgtm) or has issues
VERDICT=$(opencode run "Output: $FINDINGS

If the output indicates code review passed with no issues, return exactly 'lgtm'. Otherwise return 'issues'." --model opencode/big-pickle 2>/dev/null || echo "issues")

if echo "$VERDICT" | grep -qi "lgtm"; then
  rm -f "$FAIL_COUNT_FILE"  # Reset counter on success
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Review PASSED (lgtm)" >> "$DEBUG_LOG"
  exit 0  # Review passed, don't bother Claude
fi

# Has issues - increment counter and show to Claude
echo $((FAIL_COUNT + 1)) > "$FAIL_COUNT_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Review has ISSUES, showing to Claude" >> "$DEBUG_LOG"
echo "## Codex Code Review Findings (attempt $((FAIL_COUNT + 1))/5)" >&2
echo "" >&2
echo "$FINDINGS" >&2
exit 2
