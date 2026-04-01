---
name: devsh-spawn
description: Spawn a sub-agent in a remote sandbox. Simple wrapper around devsh orchestrate spawn for quick task delegation.
context: fork
allowed-tools:
  - Bash
  - Read
when_to_use: >
  When you need to delegate a task to a remote sandbox agent. Use for
  compute-heavy work, parallel execution, or isolated environments.
argument-hint: --agent <model> "prompt"
---

# /devsh-spawn - Spawn Remote Sub-Agent

Spawn a sub-agent in a remote sandbox to work on a task.

## Quick Usage

```bash
# Spawn with default agent (codex/gpt-5.1-codex-mini)
devsh orchestrate spawn "Fix the login bug in auth.ts"

# Spawn with specific agent
devsh orchestrate spawn --agent claude/haiku-4.5 "Add input validation"

# Spawn with repo context
devsh orchestrate spawn --agent claude/sonnet-4.5 --repo owner/repo "Implement feature X"

# Spawn and get task ID for tracking
TASK_ID=$(devsh orchestrate spawn --json --agent claude/haiku-4.5 "Task" | jq -r '.orchestrationTaskId')
```

## Common Options

| Flag | Description |
|------|-------------|
| `--agent <name>` | Agent model (e.g., `claude/haiku-4.5`, `codex/gpt-5.1-codex-mini`) |
| `--repo <owner/repo>` | GitHub repository to clone |
| `--branch <name>` | Branch to checkout |
| `--depends-on <id>` | Wait for another task first |
| `--json` | Output JSON (for scripting) |
| `--compact` | Minimal output |
| `--sync` | Block until task completes |

## Agent Selection Guide

| Agent | Best For |
|-------|----------|
| `claude/haiku-4.5` | Quick fixes, simple tasks |
| `claude/sonnet-4.5` | Balanced speed/quality |
| `claude/opus-4.6` | Complex reasoning |
| `codex/gpt-5.1-codex-mini` | Fast implementation |
| `codex/gpt-5.4-xhigh` | High-quality code generation |

## Examples

### Simple Task Delegation
```bash
devsh orchestrate spawn --agent claude/haiku-4.5 "Add error handling to api.ts"
```

### Synchronous Spawn (Wait for Result)
```bash
devsh orchestrate spawn --sync --agent codex/gpt-5.1-codex-mini "Write unit tests for utils.ts"
```

### Chain Tasks with Dependencies
```bash
# First task
TASK1=$(devsh orchestrate spawn --json --agent claude/sonnet-4.5 "Implement auth" | jq -r '.orchestrationTaskId')

# Second task waits for first
devsh orchestrate spawn --depends-on $TASK1 --agent codex/gpt-5.1-codex-mini "Write auth tests"
```

### Inline Plan Execution
```bash
devsh orchestrate spawn --agent claude/opus-4.6 --repo owner/repo "
Implement user roles feature:
1. Add Role model to schema
2. Create role-based middleware
3. Update API endpoints
4. Write tests
"
```

## Tracking Spawned Tasks

After spawning, track with:
```bash
devsh orchestrate status <task-id> --watch
devsh orchestrate wait <task-id>
devsh orchestrate cancel <task-id>
```

## See Also

- `/devsh-orchestrator` - Full orchestration documentation
- `/devsh-inject` - Send instructions to running agents
