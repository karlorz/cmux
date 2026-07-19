---
description: "DEPRECATED: Claude autopilot continue-loop controls (no longer active)"
argument-hint: "[optional: stop|status|status-all|all]"
allowed-tools: Bash
---

# DEPRECATED: `/autopilot_reset`

**Status:** Deprecated as of 2026-07-20.

Claude Code no longer registers the Stop continue-loop hook
(`.claude/hooks/autopilot-keep-running.sh`) or the SessionStart bootstrap
(`.claude/hooks/session-start.sh`). Resetting turn counters has no effect on
live Claude sessions.

See: `.claude/hooks/DEPRECATED.md`

## Instructions

1. Tell the user this command is **deprecated** and inactive for Claude Code.
2. Summarize replacements:
   - Explicit multi-turn work / plan execution skills
   - Codex managed hooks when using Codex
   - Sandbox task autopilot (`devsh --autopilot`) for long-running cmux work
3. If they still want diagnostic state from leftover temp files, optionally run:

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
"$ROOT"/scripts/autopilot-reset.sh --provider claude status
```

Do **not** present reset/stop/debug modes as supported operational controls.
