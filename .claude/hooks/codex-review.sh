#!/bin/bash
# Runs codex code review in background and shows results on next stop
# This avoids blocking the stop hook while codex runs (which can take 5+ minutes)
#
# Transport failures (Cloudflare/timeout/exec) are tracked separately from
# code review findings. Repeated transport failures trigger a cooldown to
# avoid wasting resources.

set -euo pipefail

# Debug logging is opt-in via CODEX_REVIEW_DEBUG=1
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
REVIEWED_FILE="/tmp/codex-review-reviewed-${SESSION_ID}"
RESULT_FILE="/tmp/codex-review-result-${SESSION_ID}"
RESULT_TYPE_FILE="/tmp/codex-review-result-type-${SESSION_ID}"
BG_PID_FILE="/tmp/codex-review-pid-${SESSION_ID}"
BG_STATE_FILE="/tmp/codex-review-bg-state-${SESSION_ID}"
FAIL_COUNT_FILE="/tmp/codex-review-fails-${SESSION_ID}"
TRANSPORT_FAIL_FILE="/tmp/codex-review-transport-fails-${SESSION_ID}"
TRANSPORT_COOLDOWN_FILE="/tmp/codex-review-transport-cooldown-${SESSION_ID}"
AUTOPILOT_BLOCKED_FILE="/tmp/claude-autopilot-blocked-${SESSION_ID}"
COMPLETED_FILE="/tmp/claude-autopilot-completed-${SESSION_ID}"

# Cooldown settings
TRANSPORT_FAIL_THRESHOLD="${CODEX_REVIEW_TRANSPORT_FAIL_THRESHOLD:-3}"
TRANSPORT_COOLDOWN_SECONDS="${CODEX_REVIEW_TRANSPORT_COOLDOWN_SECONDS:-300}"

# Clean up completed marker on exit
trap 'rm -f "$COMPLETED_FILE"' EXIT

# Autopilot is only active when Claude set it for this run and it has not been
# explicitly disabled via AUTOPILOT_KEEP_RUNNING_DISABLED=1.
AUTOPILOT_ACTIVE="0"
if [ "${CLAUDE_AUTOPILOT:-0}" = "1" ] && [ "${AUTOPILOT_KEEP_RUNNING_DISABLED:-0}" != "1" ]; then
  AUTOPILOT_ACTIVE="1"
fi
debug_log "AUTOPILOT_ACTIVE: $AUTOPILOT_ACTIVE, AUTOPILOT_BLOCKED_FILE exists: $([ -f "$AUTOPILOT_BLOCKED_FILE" ] && echo 'true' || echo 'false')"

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

# --- Compute current state fingerprint FIRST ---
CURRENT_HEAD=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
MAIN_BASE=$(git merge-base main HEAD 2>/dev/null || echo "unknown")
HAS_UNCOMMITTED=$(git status --porcelain 2>/dev/null | grep -q . && echo "1" || echo "0")

# For dirty tree, include hash of both unstaged AND staged changes
if [ "$HAS_UNCOMMITTED" = "1" ]; then
  # Combine unstaged (git diff) and staged (git diff --cached) for full fingerprint
  DIRTY_HASH=$({ git diff 2>/dev/null; git diff --cached 2>/dev/null; } | shasum -a 256 | cut -c1-16)
else
  DIRTY_HASH="clean"
fi

STATE_FINGERPRINT="${CURRENT_HEAD}:${DIRTY_HASH}"
debug_log "Current state fingerprint: $STATE_FINGERPRINT"

# --- Check for completed background review results ---
# Show results from previous background review if available
if [ -f "$RESULT_FILE" ]; then
  PREV_STATE=$(cat "$BG_STATE_FILE" 2>/dev/null || echo "")
  FINDINGS=$(cat "$RESULT_FILE")
  RESULT_TYPE=$(cat "$RESULT_TYPE_FILE" 2>/dev/null || echo "findings")
  rm -f "$RESULT_FILE" "$RESULT_TYPE_FILE" "$BG_PID_FILE" "$BG_STATE_FILE"

  # Discard stale results if repo state changed since review started
  if [ "$PREV_STATE" != "$STATE_FINGERPRINT" ]; then
    debug_log "Discarding stale results for $PREV_STATE (current: $STATE_FINGERPRINT)"
    FINDINGS=""
    RESULT_TYPE=""
  fi

  if [ -n "$FINDINGS" ]; then
    debug_log "Found background review results for state: $PREV_STATE (type: $RESULT_TYPE)"

    # Handle transport failures separately - do NOT feed into opencode verdict
    if [ "$RESULT_TYPE" = "transport_failure" ]; then
      debug_log "Background review had transport failure (not incrementing issue fail counter)"

      # Track consecutive transport failures for cooldown
      TRANSPORT_FAILS=0
      if [ -f "$TRANSPORT_FAIL_FILE" ]; then
        TRANSPORT_FAILS=$(cat "$TRANSPORT_FAIL_FILE")
      fi
      TRANSPORT_FAILS=$((TRANSPORT_FAILS + 1))
      echo "$TRANSPORT_FAILS" > "$TRANSPORT_FAIL_FILE"
      debug_log "Consecutive transport failures: $TRANSPORT_FAILS"

      # If threshold reached, set cooldown timestamp
      if [ "$TRANSPORT_FAILS" -ge "$TRANSPORT_FAIL_THRESHOLD" ]; then
        COOLDOWN_UNTIL=$(($(date +%s) + TRANSPORT_COOLDOWN_SECONDS))
        echo "$COOLDOWN_UNTIL" > "$TRANSPORT_COOLDOWN_FILE"
        debug_log "Transport failure threshold reached ($TRANSPORT_FAILS >= $TRANSPORT_FAIL_THRESHOLD), cooldown until $(date -d "@$COOLDOWN_UNTIL" 2>/dev/null || echo "$COOLDOWN_UNTIL")"
      fi

      # Report transport failure to the agent but do NOT increment issue fail counter
      echo "## Codex Review Transport Failure

$FINDINGS

---
Codex review could not complete due to transport/connectivity issues. This is NOT a code review finding." >&2
      exit 2
    fi

    # Normal code review findings path — successful Codex run resets transport state
    rm -f "$TRANSPORT_FAIL_FILE" "$TRANSPORT_COOLDOWN_FILE"

    FAIL_COUNT=0
    if [ -f "$FAIL_COUNT_FILE" ]; then
      FAIL_COUNT=$(cat "$FAIL_COUNT_FILE")
    fi

    if [ "$FAIL_COUNT" -ge 5 ]; then
      debug_log "Hit fail limit, not showing results"
    else
      # Use opencode to check if review passed
      VERDICT=$(opencode run "Output: $FINDINGS

If the output indicates code review passed with no issues, return exactly 'lgtm'. Otherwise return 'issues'." --model opencode/big-pickle 2>/dev/null || echo "issues")

      if echo "$VERDICT" | grep -qi "lgtm"; then
        rm -f "$FAIL_COUNT_FILE"
        debug_log "Background review PASSED (lgtm)"
        echo "$PREV_STATE" > "$REVIEWED_FILE"
        # Review passed, no action needed
      else
        echo "$PREV_STATE" > "$REVIEWED_FILE"
        echo $((FAIL_COUNT + 1)) > "$FAIL_COUNT_FILE"
        debug_log "Background review has ISSUES"

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

        echo "## Codex Code Review Findings (attempt $((FAIL_COUNT + 1))/5)

$FINDINGS

---
Please address the above issues.${REMAINING_INFO}" >&2
        exit 2
      fi
    fi
  fi
fi

# --- Session-based work detection (fingerprint already computed above) ---

# Check if already reviewed this exact state
if [ -f "$REVIEWED_FILE" ] && [ "$(cat "$REVIEWED_FILE")" = "$STATE_FINGERPRINT" ]; then
  debug_log "Skipping: already reviewed state $STATE_FINGERPRINT"
  exit 0
fi

# Check if background review already running for this state
if [ -f "$BG_PID_FILE" ] && [ -f "$BG_STATE_FILE" ]; then
  BG_PID=$(cat "$BG_PID_FILE")
  BG_STATE=$(cat "$BG_STATE_FILE")
  if [ "$BG_STATE" = "$STATE_FINGERPRINT" ] && kill -0 "$BG_PID" 2>/dev/null; then
    debug_log "Background review already running for state $STATE_FINGERPRINT (pid $BG_PID)"
    exit 0
  fi
fi

# Determine if there's work to review
COMMITS_AHEAD=$(git rev-list --count "${MAIN_BASE}..HEAD" 2>/dev/null || echo "0")

if [ "$COMMITS_AHEAD" = "0" ] && [ "$HAS_UNCOMMITTED" = "0" ]; then
  TURN_FILE="/tmp/claude-autopilot-turns-${SESSION_ID}"
  if [ "$AUTOPILOT_ACTIVE" = "1" ] && [ -f "$COMPLETED_FILE" ]; then
    debug_log "Work detected via autopilot completed marker"
  elif [ -f "$TURN_FILE" ]; then
    debug_log "Work detected via turn file"
  else
    debug_log "Skipping: no work vs main"
    exit 0
  fi
fi

debug_log "Proceeding with codex review..."

# Check transport failure cooldown before starting new review
if [ -f "$TRANSPORT_COOLDOWN_FILE" ]; then
  COOLDOWN_UNTIL=$(cat "$TRANSPORT_COOLDOWN_FILE")
  NOW=$(date +%s)
  if [ "$NOW" -lt "$COOLDOWN_UNTIL" ]; then
    REMAINING=$((COOLDOWN_UNTIL - NOW))
    debug_log "Skipping: transport failure cooldown active (${REMAINING}s remaining)"
    exit 0
  else
    debug_log "Transport failure cooldown expired, resuming reviews"
    rm -f "$TRANSPORT_COOLDOWN_FILE"
  fi
fi

# Dry-run mode
if [ "${CODEX_REVIEW_DRY_RUN:-}" = "1" ]; then
  debug_log "Dry-run mode, exiting"
  exit 0
fi

# Check fail count before starting new review
FAIL_COUNT=0
if [ -f "$FAIL_COUNT_FILE" ]; then
  FAIL_COUNT=$(cat "$FAIL_COUNT_FILE")
fi
if [ "$FAIL_COUNT" -ge 5 ]; then
  debug_log "Hit fail limit, not starting new review"
  exit 0
fi

debug_log "Starting background codex review for state $STATE_FINGERPRINT..."

# Kill any existing background review (and its children)
if [ -f "$BG_PID_FILE" ]; then
  OLD_PID=$(cat "$BG_PID_FILE")
  debug_log "Killing old background review (pid $OLD_PID)"
  # Kill process tree: first children, then parent
  pkill -P "$OLD_PID" 2>/dev/null || true
  kill "$OLD_PID" 2>/dev/null || true
  rm -f "$BG_PID_FILE" "$BG_STATE_FILE"
fi

# Start background review using the extractor script
EXTRACTOR_SCRIPT="$CLAUDE_PROJECT_DIR/.claude/scripts/codex-review-extract.sh"
(
  TMPFILE=$(mktemp)
  trap 'rm -f "$TMPFILE"' EXIT

  EXTRACTOR_EXIT=0
  CLAUDE_PROJECT_DIR="$CLAUDE_PROJECT_DIR" "$EXTRACTOR_SCRIPT" --base main > "$TMPFILE" 2>&1 || EXTRACTOR_EXIT=$?

  FINDINGS=$(cat "$TMPFILE")

  if [ "$EXTRACTOR_EXIT" -ne 0 ]; then
    # Extractor exited non-zero -> transport/batch failure
    echo "$FINDINGS" > "$RESULT_FILE"
    echo "transport_failure" > "$RESULT_TYPE_FILE"
  else
    # Extractor succeeded -> code review findings or clean
    echo "$FINDINGS" > "$RESULT_FILE"
    echo "findings" > "$RESULT_TYPE_FILE"
  fi

  rm -f "$BG_PID_FILE"
) &

BG_PID=$!
echo "$BG_PID" > "$BG_PID_FILE"
echo "$STATE_FINGERPRINT" > "$BG_STATE_FILE"
debug_log "Background review started (pid $BG_PID)"

# Exit immediately - don't block the stop hook
exit 0
