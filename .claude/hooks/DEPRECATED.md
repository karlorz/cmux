# Deprecated: Claude Code autopilot continue loop

**Status:** Deprecated as of 2026-07-20  
**Scope:** Claude Code *in-session* Stop/SessionStart continue-loop only

## What was retired

Project `.claude/settings.json` no longer registers:

| Hook event | Script | Role |
|---|---|---|
| `SessionStart` | `session-start.sh` | Session ID / activity bootstrap for Claude autopilot state |
| `Stop` | `autopilot-keep-running.sh` | Keep-alive continue loop (`CMUX_AUTOPILOT_ENABLED` / `CLAUDE_AUTOPILOT`) |

Related Claude-only control surfaces are also deprecated:

- `.claude/commands/autopilot_reset.md` (`/autopilot_reset`)
- Claude provider mode of `scripts/autopilot-reset.sh`

These files remain in the tree for reference and existing local tests, but they are **not wired** into Claude Code sessions anymore.

## Still active (not deprecated)

- `bun-check.sh` and `codex-review.sh` Stop hooks in `.claude/settings.json`
- Codex managed hooks (`scripts/install-codex-home-hooks.sh`, `.codex/hooks/*`)
- Shared cores used by non-Claude providers:
  - `scripts/hooks/cmux-autopilot-stop-core.sh`
  - `scripts/hooks/cmux-session-start-core.sh`
- Product / sandbox task autopilot (`devsh --autopilot`, lifecycle E2E)
- External multi-turn driver `scripts/agent-autopilot.sh` (process-level loop, not Claude Stop-hook continue)

## Replacement

Do not enable Claude in-process continue via Stop hooks. Prefer:

1. Explicit user turns / plan execution skills
2. Codex managed hooks when using Codex
3. Sandbox task autopilot for long-running cmux work
4. `scripts/agent-autopilot.sh` only when an external CLI loop is intentionally desired

## Re-enable (not recommended)

If you must temporarily restore Claude continue-loop behavior, re-register the two hooks in `.claude/settings.json` and set `CMUX_AUTOPILOT_ENABLED=1`. This is unsupported and may conflict with review/quality Stop hooks.
