# Plan Files

This directory contains implementation plans for sub-agent delegation.

## Workflow

1. **Create plan**: Copy `TEMPLATE.md` to `<task-name>.md` and fill in details
2. **Execute**: Run `.claude/scripts/execute-plan.sh [plan-file] [agent]`
3. **Track**: Use `devsh orchestrate status <orch-task-id> --watch`

## Key Principle

Plan files stay here for operator reference. Content is embedded in spawn prompts since sub-agents cannot read local paths.

## Available Agents

| Agent | Use Case |
|-------|----------|
| `codex/gpt-5.4-xhigh` | Production feature/fix work |
| `codex/gpt-5.1-codex-mini` | Default, validation |
| `claude/opus-4.6` | Complex reasoning |
| `claude/opus-4.5` | Production work |
| `claude/haiku-4.5` | Quick validation |

## ID Contract

| ID Type | Commands |
|---------|----------|
| `<orch-task-id>` | status, debug, wait, cancel |
| `<task-run-id>` | message |
| `<task-id>` | task retry |
| `<orchestration-id>` | results (when available) |

## Example

```bash
# Create plan
cp TEMPLATE.md fix-auth-bug.md
# Edit fix-auth-bug.md...

# Dry run first
../../scripts/execute-plan.sh --dry-run fix-auth-bug.md codex/gpt-5.1-codex-mini

# Execute
../../scripts/execute-plan.sh fix-auth-bug.md codex/gpt-5.1-codex-mini

# Track (use orch-task-id from output)
devsh orchestrate status ns7abc123 --watch
```

## Timeout Behavior

Default timeout: **30 minutes**. For longer tasks:

- Break into smaller plans (< 30 min each)
- Use `devsh task create --autopilot --autopilot-minutes 120` for extended sessions
- Monitor with `devsh orchestrate status <id> --watch`

## Idle Detection

Sub-agents automatically stop when idle (no git changes for 3 consecutive turns). This prevents infinite loops when a session has no work to do. Configure with `CLAUDE_AUTOPILOT_IDLE_THRESHOLD`.
