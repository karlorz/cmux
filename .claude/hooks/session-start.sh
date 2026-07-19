#!/bin/bash
# DEPRECATED (2026-07-20): Claude Code SessionStart bootstrap for autopilot state.
# No longer registered in .claude/settings.json. See .claude/hooks/DEPRECATED.md.
# Kept for reference and legacy tests only. Do not re-wire without an explicit decision.
set -euo pipefail

if [ "${CMUX_ALLOW_DEPRECATED_CLAUDE_AUTOPILOT:-0}" != "1" ]; then
  echo "DEPRECATED: Claude session-start autopilot bootstrap is disabled." >&2
  echo "See .claude/hooks/DEPRECATED.md (set CMUX_ALLOW_DEPRECATED_CLAUDE_AUTOPILOT=1 to force)." >&2
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

export CMUX_HOOK_PROVIDER="claude"
export CMUX_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PROJECT_DIR}"
export CMUX_SESSION_START_OUTPUT_MODE="claude-env"
export CMUX_SESSION_ENV_NAME="CLAUDE_SESSION_ID"
export CMUX_SESSION_STATE_PREFIX="${CMUX_SESSION_STATE_PREFIX:-claude-autopilot}"
export CMUX_SESSION_FILE="/tmp/claude-current-session-id"
export CMUX_SESSION_ACTIVITY_SCRIPT="${CMUX_SESSION_ACTIVITY_SCRIPT:-$SCRIPT_DIR/session-activity-capture.sh}"
export CMUX_SESSION_START_DEBUG_LOG="${CMUX_SESSION_START_DEBUG_LOG:-/tmp/claude-session-start-debug.log}"

exec "$PROJECT_DIR/scripts/hooks/cmux-session-start-core.sh"
