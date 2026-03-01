---
description: Reset autopilot turn counter to allow session to run fresh
argument-hint: "[optional: stop|status|all]"
allowed-tools: Bash
---

Reset or control the autopilot turn counter for the current session.

Mode: $ARGUMENTS (default: reset)

## Auto-collected context

### Current autopilot status (all active sessions)
!`bash -c 'MAX=${CLAUDE_AUTOPILOT_MAX_TURNS:-20}; echo "Max turns: $MAX"; echo ""; echo "Active sessions:"; found=0; for f in /tmp/claude-autopilot-turns-*; do [ -f "$f" ] || continue; found=1; SID="${f#/tmp/claude-autopilot-turns-}"; TURNS=$(cat "$f"); FLAGS=""; [ -f "/tmp/claude-autopilot-stop-$SID" ] && FLAGS="$FLAGS [STOP]"; [ -f "/tmp/claude-autopilot-blocked-$SID" ] && FLAGS="$FLAGS [ACTIVE]"; echo "  ${SID:0:20}...: turn $TURNS$FLAGS"; done; [ $found -eq 0 ] && echo "  (none)"; exit 0'`

### Current session ID
!`cat /tmp/claude-current-session-id 2>/dev/null || echo "(not set - restart session to enable)"`

## Actions

Based on mode `$ARGUMENTS`:

### reset (default)
Reset the turn counter to 0, allowing another full cycle of autopilot turns.

### stop
Create a stop file to immediately stop autopilot on next turn.

### status
Just show the auto-collected status above.

## Instructions

1. If mode is `status`: Just report the auto-collected context above, no action needed.

2. If mode is `stop`: Run this command via Bash tool (current session only):
```bash
SID=$(cat /tmp/claude-current-session-id 2>/dev/null)
if [ -z "$SID" ]; then
  echo "No session ID found. Restart session to enable."
  exit 1
fi
touch "/tmp/claude-autopilot-stop-${SID}"
echo "Stop file created for current session: ${SID:0:20}..."
echo "Autopilot will stop on next turn."
```

3. If mode is `reset` or empty: Run this command via Bash tool (current session only):
```bash
SID=$(cat /tmp/claude-current-session-id 2>/dev/null)
MAX_TURNS="${CLAUDE_AUTOPILOT_MAX_TURNS:-20}"
if [ -z "$SID" ]; then
  echo "No session ID found. Restart session to enable."
  exit 1
fi
rm -f "/tmp/claude-autopilot-turns-${SID}" "/tmp/claude-autopilot-stop-${SID}" "/tmp/claude-autopilot-blocked-${SID}"
echo "Reset current session: ${SID:0:20}..."
echo "Next cycle will start from turn 1/$MAX_TURNS"
```

4. If mode is `all`: Run this command via Bash tool (all sessions):
```bash
COUNT=0
MAX_TURNS="${CLAUDE_AUTOPILOT_MAX_TURNS:-20}"
shopt -s nullglob 2>/dev/null || true
for f in /tmp/claude-autopilot-turns-*; do
  [ -f "$f" ] || continue
  SID="${f#/tmp/claude-autopilot-turns-}"
  rm -f "/tmp/claude-autopilot-turns-${SID}" "/tmp/claude-autopilot-stop-${SID}" "/tmp/claude-autopilot-blocked-${SID}"
  echo "Reset: ${SID:0:20}..."
  COUNT=$((COUNT + 1))
done
echo "Reset $COUNT session(s). Next cycle will start from turn 1/$MAX_TURNS"
```

Report the result to the user.
