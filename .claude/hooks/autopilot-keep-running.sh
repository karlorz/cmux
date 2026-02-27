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

# Infinite loop guard: if stop_hook_active is true, a Stop hook already blocked
# once this cycle, so allow stop to prevent infinite loops
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# Session-scoped stop file
SESSION_STOP_FILE="/tmp/claude-autopilot-stop-${SESSION_ID}"
if [ -f "$SESSION_STOP_FILE" ]; then
  rm -f "$SESSION_STOP_FILE"
  echo "Autopilot stop file detected for session ${SESSION_ID}" >&2
  exit 0
fi

# External stop file (for agent-autopilot.sh integration)
if [ -n "${CLAUDE_AUTOPILOT_STOP_FILE:-}" ] && [ -f "$CLAUDE_AUTOPILOT_STOP_FILE" ]; then
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
  rm -f "$TURN_FILE"
  echo "Autopilot max turns reached ($MAX_TURNS) for session ${SESSION_ID}" >&2
  exit 0
fi

# Block stop - output continuation prompt
echo "" >&2
echo "[Autopilot] Turn $TURN_COUNT/$MAX_TURNS - continuing work..." >&2
echo "" >&2
echo "Continue from where you left off. Do not ask whether to continue." >&2
echo "End with: Progress, Commands run, Files changed, Next." >&2
exit 2
