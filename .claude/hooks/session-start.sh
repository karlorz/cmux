#!/bin/bash
# Exports CLAUDE_SESSION_ID to environment for slash commands
# This hook runs on SessionStart and persists the session ID

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "default"' 2>/dev/null || echo "default")

# Write session ID to a file that slash commands can read
echo "$SESSION_ID" > /tmp/claude-current-session-id

# Output environment variable for Claude to set
echo "{\"env\": {\"CLAUDE_SESSION_ID\": \"$SESSION_ID\"}}"
