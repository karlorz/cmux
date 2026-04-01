---
name: devsh-orchestrator
description: Multi-agent orchestration skill for spawning and coordinating sub-agents in sandboxes via devsh CLI.
context: fork
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Agent
when_to_use: >
  When you need to delegate work to remote sandboxes, run parallel tasks,
  or coordinate multiple agents. Use for compute-heavy tasks, isolated
  environments, or when the local context window is insufficient.
argument-hint: <spawn|status|wait|list|cancel> [options]
---

# devsh-orchestrator - Multi-Agent Orchestration Skill

> **Purpose**: Enable head agents to orchestrate multiple sub-agents running in cloud sandboxes.

## Quick Start

```bash
# Spawn a sub-agent
devsh orchestrate spawn --agent claude/haiku-4.5 --repo owner/repo "Fix the auth bug"

# Spawn and wait for completion (sync mode)
devsh orchestrate spawn --sync --agent claude/haiku-4.5 "Quick task" --json --compact

# Check status
devsh orchestrate status <orch-task-id> --json --compact

# Wait for completion
devsh orchestrate wait <orch-task-id> --timeout 10m
```

## Fractal Agency: Headless Remote Execution

Remote sandboxes run the **exact same native CLI** (Claude Code or Codex CLI) in headless mode:

- **Claude Code**: `claude --print --yes --json "Your prompt here"`
- **Codex CLI**: `codex exec "Your prompt here"`

### Sandbox Security Model

1. **API keys are never exposed** — sandboxes receive a proxy URL + placeholder key
2. **Full tool permissions** — sandbox is fully disposable
3. **Fire-and-forget** — if a worker fails, cancel and re-spawn with adjusted prompt

### Backend Selection

| Backend | When to use | Spawn time |
|---------|-------------|------------|
| `pve-lxc` (default) | Most tasks | ~30s |
| `morph` | Pre-baked snapshots | ~15s |
| `--cloud-workspace` | Nested coordination | ~45s |

## Commands

### Spawn Agent

```bash
devsh orchestrate spawn [flags] "prompt"

# Key flags:
#   --agent <name>        Agent to use (required)
#   --repo <owner/repo>   Repository to clone
#   --sync                Wait for completion (combines spawn + wait)
#   --timeout <duration>  Timeout for sync mode (default: 10m)
#   --compact             Minimal JSON output (with --json)
#   --depends-on <id>     Task dependency
```

### Get Status

```bash
devsh orchestrate status <orch-task-id> --json --compact
```

### Wait for Completion

```bash
devsh orchestrate wait <orch-task-id> --timeout 10m --json --compact
```

### List Tasks

```bash
devsh orchestrate list --status running --json --compact
```

## Result Collection Pattern

```bash
# Option 1: Sync mode (recommended for agents)
RESULT=$(devsh orchestrate spawn --sync --agent claude/opus-4.6 "Implement X" --json --compact)

# Option 2: Async spawn + wait
TASK_ID=$(devsh orchestrate spawn --agent claude/opus-4.6 "Implement X" --json | jq -r '.OrchestrationTaskID')
devsh orchestrate wait $TASK_ID --timeout 600
RESULT=$(devsh orchestrate status $TASK_ID --json --compact)
```

## Failure Handling

```bash
# Check failure reason
devsh orchestrate status $TASK_ID --json | jq '.Task.ErrorMessage'

# Cancel if still running
devsh orchestrate cancel $TASK_ID

# Re-spawn with adjusted prompt
devsh orchestrate spawn --sync --agent claude/opus-4.6 \
  "Implement X. NOTE: Previous attempt failed because Y. Avoid Z."
```

## Best Practices

1. Use `--sync --compact --json` for agent-friendly output
2. Use specialized agents: haiku for quick fixes, opus for complex reasoning
3. Embrace fire-and-forget: re-spawn on failure rather than mid-flight steering
4. Keep prompts focused: each sub-agent should have a clear, specific task
