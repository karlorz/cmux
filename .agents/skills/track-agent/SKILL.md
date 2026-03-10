---
name: track-agent
description: Track a spawned coding agent's progress with watch mode updates
---

# Track Agent

> **Purpose**: Monitor the progress of a spawned coding agent, wait for completion, inspect outcomes, and cancel tasks when needed.

## Quick Start

```bash
# List all spawned agents
devsh orchestrate list

# Track a specific task with polling watch mode
devsh orchestrate status <orch-task-id> --watch

# Wait for completion
devsh orchestrate wait <orch-task-id>
```

## Usage

### List Running Agents
```bash
# All agents
devsh orchestrate list

# Filter by status
devsh orchestrate list --status running
devsh orchestrate list --status completed
devsh orchestrate list --status failed
```

### Track Specific Agent
```bash
# One-time status check
devsh orchestrate status <orch-task-id>

# Polling watch mode (exits when complete)
devsh orchestrate status <orch-task-id> --watch

# Custom polling interval
devsh orchestrate status <orch-task-id> --watch --interval 5
```

### Get Aggregated Results
```bash
# Aggregated results require an orchestration session ID
devsh orchestrate results <orchestration-id>

# JSON format for parsing
devsh orchestrate results <orchestration-id> --json
```

Use `results` only when you actually have an orchestration session ID, such as from a cloud head-agent or migrate-backed workflow.

### Wait for Completion
```bash
# Wait with default timeout (5 minutes)
devsh orchestrate wait <orch-task-id>

# Custom timeout
devsh orchestrate wait <orch-task-id> --timeout 10m
```

## Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Waiting to be assigned |
| `assigned` | Assigned to a sandbox |
| `running` | Agent is executing |
| `completed` | Successfully finished |
| `failed` | Execution failed |
| `cancelled` | Manually cancelled |

## Cancellation

```bash
# Cancel a running agent
devsh orchestrate cancel <orch-task-id>
```

## Example Output

```text
Orchestration Task: ns7abc123
Status: running
Agent: codex/gpt-5.1-codex-mini
Prompt: Execute the implementation plan...
Started: 2026-03-08T14:30:00Z
Sandbox: morphvm_xyz789
```

## Notes

- `status --watch` is **polling watch mode**, not an SSE stream.
- `status`, `wait`, and `cancel` take `<orch-task-id>`.
- `results` takes `<orchestration-id>`.
- Use this skill for monitoring and cancellation, not for planning or delegation.

## Related Skills

- `/head-agent-init` - Initialize workflow head-agent mode
- `/execute-plan` - Execute a saved plan
