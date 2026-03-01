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
debug_log "SESSION_ID: $SESSION_ID"

# Skip if autopilot specifically blocked this stop. We check the autopilot-specific
# flag file instead of the generic stop_hook_active, because stop_hook_active can
# be set by any previous hook (e.g. bun-check), which would incorrectly prevent
# the review from running on the final stop.
#
# Guard: only honor the flag file when autopilot is actually active. This prevents
# stale flag files from suppressing review after autopilot is toggled off or if
# cleanup was missed (e.g. process crash).
AUTOPILOT_BLOCKED_FILE="/tmp/claude-autopilot-blocked-${SESSION_ID}"
# Autopilot is only truly active when enabled AND not disabled via override.
# AUTOPILOT_KEEP_RUNNING_DISABLED=1 causes the autopilot hook to exit before
# cleanup, so the blocked flag can persist even though autopilot is effectively off.
AUTOPILOT_ACTIVE="0"
if [ "${CLAUDE_AUTOPILOT:-0}" = "1" ] && [ "${AUTOPILOT_KEEP_RUNNING_DISABLED:-0}" != "1" ]; then
  AUTOPILOT_ACTIVE="1"
fi
debug_log "AUTOPILOT_ACTIVE: $AUTOPILOT_ACTIVE, AUTOPILOT_BLOCKED_FILE exists: $([ -f "$AUTOPILOT_BLOCKED_FILE" ] && echo 'true' || echo 'false')"

if [ "$AUTOPILOT_ACTIVE" = "1" ] && [ -f "$AUTOPILOT_BLOCKED_FILE" ]; then
  debug_log "Exiting: autopilot blocked this stop (flag file exists)"
  exit 0
fi

# Clean up stale flag file if autopilot is not active
if [ "$AUTOPILOT_ACTIVE" != "1" ] && [ -f "$AUTOPILOT_BLOCKED_FILE" ]; then
  rm -f "$AUTOPILOT_BLOCKED_FILE"
  debug_log "Cleaned up stale autopilot blocked flag"
fi

# Only run review if autopilot has completed work (turn file exists = work was done)
# Skip if session never ran autopilot (idle state)
TURN_FILE="/tmp/claude-autopilot-turns-${SESSION_ID}"
STOP_FILE="/tmp/claude-autopilot-stop-${SESSION_ID}"

if [ "$AUTOPILOT_ACTIVE" = "1" ] && [ ! -f "$TURN_FILE" ]; then
  debug_log "Skipping review: autopilot enabled but no work done yet (idle)"
  exit 0
fi

# Skip if a stop file exists - this means we're waiting for user action (e.g., merge approval)
# The stop file indicates intentional pause, not session end
if [ -f "$STOP_FILE" ]; then
  debug_log "Skipping review: stop file exists (waiting for user action)"
  exit 0
fi

debug_log "Proceeding with codex review..."

# Dry-run mode: exit after pre-flight checks (for testing hook logic without codex)
if [ "${CODEX_REVIEW_DRY_RUN:-}" = "1" ]; then
  debug_log "Dry-run mode, exiting after pre-flight"
  exit 0
fi

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
debug_log "Running codex review..."
unbuffer codex \
  --dangerously-bypass-approvals-and-sandbox \
  --enable use_linux_sandbox_bwrap \
  --model gpt-5.3-codex \
  -c model_reasoning_effort="low" \
  review --base main > "$TMPFILE" 2>&1 || true
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
  exit 0  # Review passed, don't bother Claude
fi

# Has issues - increment counter and show to Claude
echo $((FAIL_COUNT + 1)) > "$FAIL_COUNT_FILE"
debug_log "Review has ISSUES, showing to Claude"
echo "## Codex Code Review Findings (attempt $((FAIL_COUNT + 1))/5)" >&2
echo "" >&2
echo "$FINDINGS" >&2
exit 2
