#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

export CMUX_HOOK_PROVIDER="claude"
export CMUX_PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PROJECT_DIR}"
export CMUX_SESSION_START_OUTPUT_MODE="claude-env"
export CMUX_SESSION_ENV_NAME="CLAUDE_SESSION_ID"
export CMUX_SESSION_FILE="/tmp/claude-current-session-id"
export CMUX_SESSION_ACTIVITY_SCRIPT="${CMUX_SESSION_ACTIVITY_SCRIPT:-$SCRIPT_DIR/session-activity-capture.sh}"
export CMUX_SESSION_START_DEBUG_LOG="${CMUX_SESSION_START_DEBUG_LOG:-/tmp/claude-session-start-debug.log}"

exec "$PROJECT_DIR/scripts/hooks/cmux-session-start-core.sh"
