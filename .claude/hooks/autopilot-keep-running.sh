#!/bin/bash
# Stop hook that keeps Claude running in autopilot mode
# Blocks Stop event unless turn limit reached or stop file exists

set -euo pipefail

# Master enable: must be explicitly set to opt-in
if [ "${CLAUDE_AUTOPILOT:-}" != "1" ]; then
  exit 0
fi

# Disable override (follows existing convention)
if [ "${AUTOPILOT_KEEP_RUNNING_DISABLED:-}" = "1" ]; then
  exit 0
fi

# Read hook stdin JSON
INPUT=$(cat)

# Parse session_id for session-scoped files
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")

# Note: we intentionally do NOT check stop_hook_active here. Autopilot is the
# first hook in the chain, so stop_hook_active=true can only mean Claude Code
# is signaling from a PREVIOUS stop event. Yielding on that would limit
# autopilot to ~1 effective block per cycle. MAX_TURNS provides sufficient
# loop protection instead.

# Helper: clean up the blocked flag so downstream hooks know autopilot is done
cleanup_blocked_flag() {
  rm -f "/tmp/claude-autopilot-blocked-${SESSION_ID}"
}

# Session-scoped stop file (from hook input session_id)
SESSION_STOP_FILE="/tmp/claude-autopilot-stop-${SESSION_ID}"
if [ -f "$SESSION_STOP_FILE" ]; then
  rm -f "$SESSION_STOP_FILE"
  cleanup_blocked_flag
  echo "Autopilot stop file detected for session ${SESSION_ID}" >&2
  exit 0
fi

# Also check stop file for current-session-id (fallback for /autopilot_reset skill)
# This handles mismatch when skill writes stop file using /tmp/claude-current-session-id
# but hook receives different session_id in stdin JSON
CURRENT_SID_FILE="/tmp/claude-current-session-id"
if [ -f "$CURRENT_SID_FILE" ]; then
  CURRENT_SID=$(tr -d '\n' < "$CURRENT_SID_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_SID" ] && [ "$CURRENT_SID" != "$SESSION_ID" ]; then
    CURRENT_STOP_FILE="/tmp/claude-autopilot-stop-${CURRENT_SID}"
    if [ -f "$CURRENT_STOP_FILE" ]; then
      rm -f "$CURRENT_STOP_FILE"
      # Clean up blocked flags for BOTH session IDs to avoid stale flags
      cleanup_blocked_flag
      rm -f "/tmp/claude-autopilot-blocked-${CURRENT_SID}"
      echo "Autopilot stop file detected for current-session ${CURRENT_SID}" >&2
      exit 0
    fi
  fi
fi

# External stop file (for agent-autopilot.sh integration)
if [ -n "${CLAUDE_AUTOPILOT_STOP_FILE:-}" ] && [ -f "$CLAUDE_AUTOPILOT_STOP_FILE" ]; then
  cleanup_blocked_flag
  echo "Autopilot external stop file detected: $CLAUDE_AUTOPILOT_STOP_FILE" >&2
  exit 0
fi

# Session-scoped turn counter
TURN_FILE="/tmp/claude-autopilot-turns-${SESSION_ID}"
MAX_TURNS="${CLAUDE_AUTOPILOT_MAX_TURNS:-20}"
TURN_COUNT=0
if [ -f "$TURN_FILE" ]; then
  TURN_COUNT=$(cat "$TURN_FILE" 2>/dev/null || echo "0")
fi
TURN_COUNT=$((TURN_COUNT + 1))
echo "$TURN_COUNT" > "$TURN_FILE"

# Check turn limit
if [ "$TURN_COUNT" -ge "$MAX_TURNS" ]; then
  # Write completed marker before deleting turn file so codex-review can detect autopilot ran
  echo "$TURN_COUNT" > "/tmp/claude-autopilot-completed-${SESSION_ID}"
  rm -f "$TURN_FILE"
  cleanup_blocked_flag
  echo "Autopilot max turns reached ($MAX_TURNS) for session ${SESSION_ID}" >&2
  exit 0
fi

# Smart delay escalation: early turns are fast (active work), later turns slow down
# (monitoring/polling phase). The hook delay stays within the 10s timeout; for longer
# waits, we instruct Claude to sleep in a bash command so the wait is visible to the user.
MONITORING_THRESHOLD="${CLAUDE_AUTOPILOT_MONITORING_THRESHOLD:-10}"
BASE_DELAY="${CLAUDE_AUTOPILOT_DELAY:-2}"

if [ "$TURN_COUNT" -le "$MONITORING_THRESHOLD" ]; then
  # Active work phase: short delay, standard continuation
  DELAY_SECONDS="$BASE_DELAY"
  WAIT_INSTRUCTION=""
  PHASE="work"
elif [ "$TURN_COUNT" -le $(( MONITORING_THRESHOLD + 5 )) ]; then
  # Monitoring phase 1: medium polling
  DELAY_SECONDS="$BASE_DELAY"
  WAIT_INSTRUCTION="Before checking status, run: sleep 30\\n"
  PHASE="monitoring-30s"
else
  # Monitoring phase 2: slow polling for long-running tasks
  DELAY_SECONDS="$BASE_DELAY"
  WAIT_INSTRUCTION="Before checking status, run: sleep 60\\n"
  PHASE="monitoring-60s"
fi

# Signal to downstream hooks (codex-review) that autopilot is blocking this stop
# IMPORTANT: Write this BEFORE the sleep to avoid race condition where parallel
# hooks (codex-review) start before the flag exists.
AUTOPILOT_BLOCKED_FILE="/tmp/claude-autopilot-blocked-${SESSION_ID}"
echo "$TURN_COUNT" > "$AUTOPILOT_BLOCKED_FILE"

if [ "$DELAY_SECONDS" -gt 0 ]; then
  sleep "$DELAY_SECONDS"
fi

# Block stop - output JSON decision to stdout
echo "[Autopilot] Turn $TURN_COUNT/$MAX_TURNS ($PHASE) - continuing..." >&2

printf '{"decision":"block","reason":"%sContinue from where you left off. Do not ask whether to continue.\\nEnd with: Progress, Commands run, Files changed, Next."}\n' "$WAIT_INSTRUCTION"
exit 0
