# Q4 Phase 6: Ralph Mode Unification

## Background

Research from the Obsidian vault (`ralph-loop-cross-platform-study.md`) identified a gap: cmux's autopilot stop hook and the Ralph Loop pattern serve different purposes, but could share infrastructure for simpler "keep working until done" tasks.

## Current State

**cmux Autopilot** (in `cmux-autopilot-stop-core.sh`):
- Uses `/tmp` for state (session-scoped)
- Dynamic continuation prompts ("Continue from where you left off")
- Policy-driven (MAX_TURNS, idle detection, monitoring phases)
- Best for: operator-controlled orchestration, time-boxed sessions

**Ralph Loop** (in Claude/Codex/OpenCode):
- Uses project-local state (`.claude/ralph-loop.local.md`, `.codex/ralph-loop-state.json`)
- Stable original prompt replay
- Completion-promise-driven (`<promise>DONE</promise>`)
- Best for: single-task iteration until explicit completion

## Goal

Add `--ralph-mode` flag to cmux-autopilot-stop-core.sh for cross-provider Ralph Loop compatibility:
1. Project-local state instead of `/tmp`
2. Check for `<promise>` completion tags
3. Replay original prompt instead of continuation prompt

## Design

### Environment Variables

```bash
CMUX_RALPH_MODE=1              # Enable Ralph mode
CMUX_RALPH_PROMPT="..."        # Original prompt to replay
CMUX_RALPH_COMPLETION_TAG="DONE"  # Completion signal (default: DONE)
CMUX_RALPH_MAX_ITERATIONS=50   # Max iterations (default: 50)
```

### State File Location

```bash
# Normal autopilot: /tmp/{provider}-autopilot-state-{session}
# Ralph mode: {project}/.{provider}/ralph-loop-state.json
```

### Completion Detection

Parse `last_assistant_message` from stop hook input:
```bash
COMPLETION_SIGNAL="<promise>${CMUX_RALPH_COMPLETION_TAG:-DONE}</promise>"
if echo "$INPUT" | jq -r '.last_assistant_message' | grep -qF "$COMPLETION_SIGNAL"; then
  log_debug "ralph: completion signal detected"
  cleanup_ralph_state
  exit 0
fi
```

### Continuation Prompt

```bash
# Normal autopilot
REASON="Continue from where you left off. Do not ask whether to continue."

# Ralph mode
REASON="$CMUX_RALPH_PROMPT"
```

## Implementation

### Phase 6a: Core Ralph Mode (1 day)
- [x] Add CMUX_RALPH_MODE env var check
- [x] Switch state file location to project-local
- [x] Add completion signal detection
- [x] Use original prompt for continuation

### Phase 6b: CLI Integration (0.5 day)
- [x] Add --ralph-mode flag to devsh spawn
- [x] Pass CMUX_RALPH_* env vars to sandbox

### Phase 6c: UI Integration (Optional)
- [ ] Add "Ralph Mode" toggle to task creation
- [ ] Show completion status in dashboard

## Files to Modify

- `scripts/hooks/cmux-autopilot-stop-core.sh` - Add Ralph mode logic
- `packages/devsh/cmd/spawn.go` - Add --ralph-mode flag (optional)

## Compatibility

Works with all providers that use the stop hook:
- Claude Code (via /stop-hook YAML)
- Codex CLI (via hooks.json)
- OpenCode (via session.idle)

## Status

- [x] Phase 6a: Core Ralph Mode (commit bb63c0c78)
- [x] Phase 6b: CLI Integration
- [x] Phase 6c: UI Integration (PR #741)
