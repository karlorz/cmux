---
name: devsh-inject
description: Send instructions to a running agent via session continuation or append. Supports both cloud and local runs.
context: fork
allowed-tools:
  - Bash
  - Read
when_to_use: >
  When you need to steer a running agent mid-task. Use to provide
  additional context, change direction, or add follow-up instructions.
argument-hint: <task-run-id|local-run-id> "instruction"
---

# /devsh-inject - Send Instructions to Running Agents

Inject instructions into a running agent via the appropriate continuation lane.

## Cloud Runs

For cloud-spawned tasks, use the mailbox message system:

```bash
# Send steering guidance
devsh orchestrate message <task-run-id> "Focus on the failing test first" --type request

# Send handoff instruction
devsh orchestrate message <task-run-id> "I've updated the schema, continue from there" --type handoff

# Broadcast status to all agents
devsh orchestrate message <task-run-id> "API changes deployed, proceed" --type status
```

### Message Types

| Type | Purpose |
|------|---------|
| `request` | Ask the agent to do something specific |
| `handoff` | Transfer work context |
| `status` | Inform about external changes |

## Local Runs

For local orchestration runs (created with `devsh orchestrate run-local --persist`):

```bash
# Auto-detect best injection mode
devsh orchestrate inject-local <run-id> "Add error handling for edge cases"

# Force active injection (session continuation)
devsh orchestrate inject-local <run-id> "Focus on security" --mode active

# Force passive injection (append file)
devsh orchestrate inject-local <run-id> "Prioritize tests" --mode passive
```

### Injection Modes

| Mode | How It Works | Agent Support |
|------|--------------|---------------|
| `active` | Continues the provider session directly | Claude (--session-id), Codex (thread resume) |
| `passive` | Writes to `append.txt` for polling | All agents |
| `auto` | Detects based on session info | Default |

## Examples

### Steer a Cloud Agent
```bash
# Get the task-run-id from status
devsh orchestrate status <orch-task-id> --json | jq -r '.TaskRun.ID'

# Send instruction
devsh orchestrate message mn7abc123xyz "The auth endpoint changed to /api/v2/auth" --type request
```

### Steer a Local Agent
```bash
# List local runs
devsh orchestrate list-local

# Inject instruction
devsh orchestrate inject-local local_abc123 "Also add input validation"
```

### Chain Injections
```bash
# Initial spawn
TASK=$(devsh orchestrate spawn --json --agent claude/sonnet-4.5 "Implement feature" | jq -r '.orchestrationTaskId')

# Wait a bit, then provide more context
sleep 60
RUN_ID=$(devsh orchestrate status $TASK --json | jq -r '.TaskRun.ID')
devsh orchestrate message $RUN_ID "Use the new v2 API format" --type request
```

## When to Use vs Kill-and-Respawn

| Scenario | Recommendation |
|----------|----------------|
| Minor course correction | Use inject |
| Provide additional context | Use inject |
| Agent going completely wrong direction | Kill and respawn with better prompt |
| Agent stuck or failing | Kill and respawn |

The general philosophy is **fail fast, re-spawn** - injection is for light steering, not major redirects.

## See Also

- `/devsh-spawn` - Spawn new agents
- `/devsh-orchestrator` - Full orchestration documentation
