#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

export CMUX_HOOK_PROVIDER="claude"
export CMUX_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PROJECT_DIR}"
export CMUX_AUTOPILOT_ENABLED="${CMUX_AUTOPILOT_ENABLED:-0}"
# Map CMUX_AUTOPILOT_ENABLED to AUTOPILOT_KEEP_RUNNING_DISABLED (inverted logic).
# Preserve existing AUTOPILOT_KEEP_RUNNING_DISABLED if already set and enabled.
if [ "$CMUX_AUTOPILOT_ENABLED" = "1" ]; then
  export AUTOPILOT_KEEP_RUNNING_DISABLED="${AUTOPILOT_KEEP_RUNNING_DISABLED:-0}"
else
  export AUTOPILOT_KEEP_RUNNING_DISABLED="1"
fi
export CMUX_AUTOPILOT_STATE_PREFIX="${CMUX_AUTOPILOT_STATE_PREFIX:-claude-autopilot}"
export CMUX_AUTOPILOT_CURRENT_SESSION_FILE="${CMUX_AUTOPILOT_CURRENT_SESSION_FILE:-/tmp/claude-current-session-id}"
export CMUX_AUTOPILOT_ENABLE_REVIEW_WINDOW="${CMUX_AUTOPILOT_ENABLE_REVIEW_WINDOW:-1}"
export CMUX_AUTOPILOT_INLINE_WRAPUP="${CMUX_AUTOPILOT_INLINE_WRAPUP:-0}"
# Claude uses hidden monitoring sleeps, so default to monitoring from the
# first hook instead of waiting for a later visible polling phase.
export CMUX_AUTOPILOT_MONITORING_THRESHOLD="${CMUX_AUTOPILOT_MONITORING_THRESHOLD:-0}"
export CMUX_SESSION_ACTIVITY_SCRIPT="${CMUX_SESSION_ACTIVITY_SCRIPT:-$SCRIPT_DIR/session-activity-capture.sh}"

exec "$PROJECT_DIR/scripts/hooks/cmux-autopilot-stop-core.sh"
