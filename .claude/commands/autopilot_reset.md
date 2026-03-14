---
description: Reset autopilot turn counter to allow session to run fresh
argument-hint: "[optional: stop|status|status-all|all]"
allowed-tools: Bash
---

Reset or control the autopilot turn counter for the current session.

Mode: $ARGUMENTS (default: reset)

## Auto-collected context

### Current session status
!`bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd); "$ROOT"/scripts/autopilot-reset.sh --provider claude status'`

## Actions

Based on mode `$ARGUMENTS`:

### reset (default)
Reset the turn counter to 0, allowing another full cycle of autopilot turns.

### stop
Create a stop file to immediately stop autopilot on next turn.

### status
Show current session ID and status only.

### status-all
Show all active sessions with their status.

### debug-on
Enable Stop-hook debug logging for Claude autopilot without restarting the session.

### debug-off
Disable Stop-hook debug logging for Claude autopilot.

## Instructions

1. If mode is `status`: Just report the auto-collected context above, no action needed.

2. If mode is `status-all`: Run this command via Bash tool to show all sessions:
```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
"$ROOT"/scripts/autopilot-reset.sh --provider claude status-all
```

3. If mode is `stop`: Run this command via Bash tool (current session only):
```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
"$ROOT"/scripts/autopilot-reset.sh --provider claude stop
```

4. If mode is `reset` or empty: Run this command via Bash tool (current session only):
```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
"$ROOT"/scripts/autopilot-reset.sh --provider claude reset
```

5. If mode is `all`: Run this command via Bash tool (all sessions):
```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
"$ROOT"/scripts/autopilot-reset.sh --provider claude all
```

6. If mode is `debug-on`: Run this command via Bash tool:
```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
"$ROOT"/scripts/autopilot-reset.sh --provider claude debug-on
```

7. If mode is `debug-off`: Run this command via Bash tool:
```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
"$ROOT"/scripts/autopilot-reset.sh --provider claude debug-off
```

Report the result to the user.
