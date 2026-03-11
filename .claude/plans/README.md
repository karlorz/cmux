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

# Execute
../../scripts/execute-plan.sh fix-auth-bug.md codex/gpt-5.1-codex-mini

# Track (use orch-task-id from output)
devsh orchestrate status ns7abc123 --watch
```
