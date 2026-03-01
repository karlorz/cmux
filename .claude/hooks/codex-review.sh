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

# Only run review if actual work was done. We check multiple sources:
# 1. git status for uncommitted/staged changes (always checked first)
# 2. git diff against main for committed changes on branch
# 3. turn file existence (backup - indicates autopilot is mid-session)
# 4. completed marker (backup - indicates autopilot reached max turns; turn file was deleted)
WORK_DONE="0"

# Check 1: Uncommitted or staged changes (git status)
if git status --porcelain 2>/dev/null | grep -q .; then
  WORK_DONE="1"
  debug_log "Work detected via git status (uncommitted/staged changes)"
fi

# Check 2: Committed changes vs main (git diff main...HEAD)
# Only check if no uncommitted work found yet
if [ "$WORK_DONE" = "0" ]; then
  git diff --quiet main...HEAD 2>/dev/null && GIT_EXIT=0 || GIT_EXIT=$?
  if [ "$GIT_EXIT" -eq 1 ]; then
    WORK_DONE="1"
    debug_log "Work detected via git diff main...HEAD (committed changes)"
  elif [ "$GIT_EXIT" -gt 1 ]; then
    debug_log "git diff main...HEAD failed ($GIT_EXIT), skipping commit diff check"
  fi
fi

# Check 3: Turn file as backup (indicates autopilot is mid-session, even if no git changes yet)
TURN_FILE="/tmp/claude-autopilot-turns-${SESSION_ID}"
if [ -f "$TURN_FILE" ] && [ "$WORK_DONE" = "0" ]; then
  WORK_DONE="1"
  debug_log "Work detected via turn file"
fi

# Check 4: Completed marker (indicates autopilot reached max turns; turn file was deleted before we ran)
COMPLETED_FILE="/tmp/claude-autopilot-completed-${SESSION_ID}"
if [ -f "$COMPLETED_FILE" ] && [ "$WORK_DONE" = "0" ]; then
  WORK_DONE="1"
  debug_log "Work detected via autopilot completed marker"
fi

if [ "$AUTOPILOT_ACTIVE" = "1" ] && [ "$WORK_DONE" = "0" ]; then
  debug_log "Skipping review: autopilot enabled but no work done (no git diff, no turn file, no completed marker)"
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

# Create temp file for output; also clean up completed marker on exit
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE" "$COMPLETED_FILE"' EXIT

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
