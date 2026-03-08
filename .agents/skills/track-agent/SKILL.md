---
name: track-agent
description: Track a spawned coding agent's progress with real-time updates
---

# Track Agent

> **Purpose**: Monitor the progress of a spawned coding agent and get results when complete.

## Quick Start

```bash
# List all spawned agents
devsh orchestrate list

# Track specific agent (with live updates)
devsh orchestrate status <orchestrationTaskId> --watch

# Get results from all agents
devsh orchestrate results
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
devsh orchestrate status <orchestrationTaskId>

# Continuous monitoring (exits when complete)
devsh orchestrate status <orchestrationTaskId> --watch

# Custom polling interval
devsh orchestrate status <orchestrationTaskId> --watch --interval 5
```

### Get Results
```bash
# All results
devsh orchestrate results

# JSON format for parsing
devsh orchestrate results --json
```

### Wait for Completion
```bash
# Wait with default timeout (5 minutes)
devsh orchestrate wait <orchestrationTaskId>

# Custom timeout
devsh orchestrate wait <orchestrationTaskId> --timeout 10m
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
devsh orchestrate cancel <orchestrationTaskId>
```

## Example Output

```
Orchestration Task: ns7abc123
Status: running
Agent: codex/gpt-5.1-codex-mini
Prompt: Execute the implementation plan...
Started: 2026-03-08T14:30:00Z
Sandbox: morphvm_xyz789
```

## Related Skills

- `/head-agent-init` - Initialize head agent mode
- `/execute-plan` - Execute a saved plan
