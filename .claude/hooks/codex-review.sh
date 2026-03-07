#!/bin/bash
# Runs codex code review and outputs only the findings

set -euo pipefail

# Debug logging is opt-in via CODEX_REVIEW_DEBUG=1 to avoid writing
# raw hook input (which may contain repo content) to world-readable /tmp.
DEBUG_ENABLED="${CODEX_REVIEW_DEBUG:-0}"
debug_log() {
  if [ "$DEBUG_ENABLED" = "1" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "/tmp/codex-review-debug.log"
  fi
}

debug_log "=== codex-review.sh START ==="
debug_log "CODEX_REVIEW_DISABLED=${CODEX_REVIEW_DISABLED:-}"
debug_log "CLAUDE_AUTOPILOT=${CLAUDE_AUTOPILOT:-}"

# Skip if disabled via env var
if [ "${CODEX_REVIEW_DISABLED:-}" = "1" ]; then
  debug_log "Exiting: CODEX_REVIEW_DISABLED=1"
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Read session_id from hook stdin JSON
INPUT=$(cat)
debug_log "INPUT JSON: $INPUT"

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")
SESSION_ID="${SESSION_ID:-default}"
debug_log "SESSION_ID: $SESSION_ID"

# Session-scoped file paths
BASELINE_FILE="/tmp/codex-review-baseline-${SESSION_ID}"
REVIEWED_FILE="/tmp/codex-review-reviewed-${SESSION_ID}"
FAIL_COUNT_FILE="/tmp/codex-review-fails-${SESSION_ID}"
SIMPLIFY_SUGGESTED_FILE="/tmp/codex-review-simplify-suggested-${SESSION_ID}"
AUTOPILOT_BLOCKED_FILE="/tmp/claude-autopilot-blocked-${SESSION_ID}"
COMPLETED_FILE="/tmp/claude-autopilot-completed-${SESSION_ID}"

# Install trap to clean up completed marker on any exit
trap 'rm -f "$COMPLETED_FILE"' EXIT

# Autopilot is only truly active when enabled AND not disabled via override
AUTOPILOT_ACTIVE="0"
if [ "${CLAUDE_AUTOPILOT:-0}" = "1" ] && [ "${AUTOPILOT_KEEP_RUNNING_DISABLED:-0}" != "1" ]; then
  AUTOPILOT_ACTIVE="1"
fi
debug_log "AUTOPILOT_ACTIVE: $AUTOPILOT_ACTIVE"

# Skip if autopilot specifically blocked this stop
if [ "$AUTOPILOT_ACTIVE" = "1" ] && [ -f "$AUTOPILOT_BLOCKED_FILE" ]; then
  debug_log "Exiting: autopilot blocked this stop (flag file exists)"
  exit 0
fi

# Clean up stale flag file if autopilot is not active
if [ "$AUTOPILOT_ACTIVE" != "1" ] && [ -f "$AUTOPILOT_BLOCKED_FILE" ]; then
  rm -f "$AUTOPILOT_BLOCKED_FILE"
  debug_log "Cleaned up stale autopilot blocked flag"
fi

# --- Session-based work detection ---
# Instead of complex WORK_DONE checks, use simple session tracking:
# 1. Track baseline commit at session start
# 2. Work exists if: HEAD moved OR uncommitted changes exist
# 3. Skip if already reviewed this exact state

CURRENT_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
HAS_UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -q . && echo "1" || echo "0")

# Set baseline on first stop of session
if [ ! -f "$BASELINE_FILE" ]; then
  echo "$CURRENT_HEAD" > "$BASELINE_FILE"
  debug_log "Set session baseline: $CURRENT_HEAD"
fi
BASELINE_HEAD=$(cat "$BASELINE_FILE")

# Build current state fingerprint (commit + uncommitted indicator)
STATE_FINGERPRINT="${CURRENT_HEAD}:${HAS_UNCOMMITTED}"

# Check if already reviewed this exact state
if [ -f "$REVIEWED_FILE" ] && [ "$(cat "$REVIEWED_FILE")" = "$STATE_FINGERPRINT" ]; then
  debug_log "Skipping: already reviewed state $STATE_FINGERPRINT"
  exit 0
fi

# Determine if there's work to review
# Work = HEAD moved from baseline OR uncommitted changes exist
HEAD_MOVED="0"
if [ "$CURRENT_HEAD" != "$BASELINE_HEAD" ]; then
  HEAD_MOVED="1"
fi

if [ "$HEAD_MOVED" = "0" ] && [ "$HAS_UNCOMMITTED" = "0" ]; then
  # No work in this session - but check autopilot markers as backup
  TURN_FILE="/tmp/claude-autopilot-turns-${SESSION_ID}"
  if [ "$AUTOPILOT_ACTIVE" = "1" ] && [ -f "$COMPLETED_FILE" ]; then
    debug_log "Work detected via autopilot completed marker"
  elif [ -f "$TURN_FILE" ]; then
    debug_log "Work detected via turn file"
  else
    debug_log "Skipping: no work in session (HEAD=$CURRENT_HEAD, baseline=$BASELINE_HEAD, uncommitted=$HAS_UNCOMMITTED)"
    exit 0
  fi
fi

debug_log "Proceeding with codex review (HEAD_MOVED=$HEAD_MOVED, HAS_UNCOMMITTED=$HAS_UNCOMMITTED)..."

# Dry-run mode: exit after pre-flight checks (for testing hook logic without codex)
if [ "${CODEX_REVIEW_DRY_RUN:-}" = "1" ]; then
  debug_log "Dry-run mode, exiting after pre-flight"
  exit 0
fi

# Hard stop after 5 failures to prevent excessive loops (per session)
FAIL_COUNT=0
if [ -f "$FAIL_COUNT_FILE" ]; then
  FAIL_COUNT=$(cat "$FAIL_COUNT_FILE")
fi
if [ "$FAIL_COUNT" -ge 5 ]; then
  exit 0  # Hit limit, stop showing issues
fi

# Create temp file for output; extend trap to also clean it
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE" "$COMPLETED_FILE"' EXIT

# REVIEW.md guidelines are loaded via AGENTS.md (codex reads it automatically).
# --base and [PROMPT] are mutually exclusive, so we cannot pass a custom prompt here.
# --sandbox danger-full-access disables sandboxing entirely (safe in isolated LXC/container).
# Timeout: 240s (4 min) to avoid blocking stop hooks too long. Uses perl for macOS compatibility.
debug_log "Running codex review..."
run_with_timeout() {
  perl -e 'alarm shift; exec @ARGV' "$@"
}
if command -v unbuffer >/dev/null 2>&1; then
  run_with_timeout 240 unbuffer codex \
    --sandbox danger-full-access \
    --model gpt-5.3-codex \
    -c model_reasoning_effort="high" \
    review --base main > "$TMPFILE" 2>&1 || true
else
  run_with_timeout 240 codex \
    --sandbox danger-full-access \
    --model gpt-5.3-codex \
    -c model_reasoning_effort="high" \
    review --base main > "$TMPFILE" 2>&1 || true
fi
debug_log "Codex review finished"

# Strip ANSI codes first, then extract final codex response
CLEAN=$(sed 's/\x1b\[[0-9;]*m//g' "$TMPFILE")

# Extract just the final codex response (after the last "codex" marker)
FINDINGS=$(echo "$CLEAN" | awk '
  /^codex$/ { found=1; content=""; next }
  found { content = content $0 "\n" }
  END { print content }
' | sed '/^$/d' | grep -v '^tokens used' | head -50)

if [ -z "$FINDINGS" ]; then
  debug_log "No FINDINGS extracted, exiting"
  exit 0  # No output from codex
fi
debug_log "FINDINGS extracted ($(echo "$FINDINGS" | wc -l) lines)"

# Use opencode to check if review passed (lgtm) or has issues
VERDICT=$(opencode run "Output: $FINDINGS

If the output indicates code review passed with no issues, return exactly 'lgtm'. Otherwise return 'issues'." --model opencode/big-pickle 2>/dev/null || echo "issues")

if echo "$VERDICT" | grep -qi "lgtm"; then
  rm -f "$FAIL_COUNT_FILE"  # Reset counter on success
  debug_log "Review PASSED (lgtm)"

  # Mark this state as reviewed
  echo "$STATE_FINGERPRINT" > "$REVIEWED_FILE"

  # Even on pass, suggest /simplify once if significant changes were made
  CHANGED_FILES=$(git diff --name-only main...HEAD 2>/dev/null | wc -l)
  if [ "$CHANGED_FILES" -gt 2 ] && [ ! -f "$SIMPLIFY_SUGGESTED_FILE" ]; then
    touch "$SIMPLIFY_SUGGESTED_FILE"
    debug_log "Suggesting /simplify for $CHANGED_FILES changed files"
    echo "Codex review passed. Consider running /simplify to check for code quality improvements across the $CHANGED_FILES changed files." >&2
    exit 2
  fi

  exit 0  # Review passed, few changes or already suggested, don't bother Claude
fi

# Has issues - increment counter and show to Claude
# Mark as reviewed (will re-review if state changes)
echo "$STATE_FINGERPRINT" > "$REVIEWED_FILE"
echo $((FAIL_COUNT + 1)) > "$FAIL_COUNT_FILE"
debug_log "Review has ISSUES, showing to Claude"

# Check if this is a mid-autopilot review and include remaining turns
REMAINING_INFO=""
if [ "$AUTOPILOT_ACTIVE" = "1" ]; then
  TURN_FILE="/tmp/claude-autopilot-turns-${SESSION_ID}"
  if [ -f "$TURN_FILE" ]; then
    CURRENT_TURN=$(cat "$TURN_FILE" 2>/dev/null || echo "0")
    AP_MAX="${CLAUDE_AUTOPILOT_MAX_TURNS:-20}"
    REMAINING=$((AP_MAX - CURRENT_TURN))
    if [ "$REMAINING" -gt 0 ]; then
      REMAINING_INFO=" You have $REMAINING autopilot turns remaining to address these."
    fi
  fi
fi

# Build feedback message with codex findings + simplify instruction
FEEDBACK="## Codex Code Review Findings (attempt $((FAIL_COUNT + 1))/5)

$FINDINGS

---
After addressing the above issues, run /simplify to check for code quality improvements (reuse, efficiency, clarity).${REMAINING_INFO}"

echo "$FEEDBACK" >&2
exit 2
