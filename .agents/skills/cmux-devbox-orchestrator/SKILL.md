---
name: cmux-devbox-orchestrator
description: Multi-agent orchestration skill for spawning and coordinating sub-agents in sandboxes. Enables head agents (like Claude Code CLI) to manage parallel task execution, inter-agent messaging, and workflow coordination.
---

# cmux-devbox-orchestrator - Multi-Agent Orchestration Skill

> **Purpose**: Enable head agents (like Claude Code CLI running locally) to orchestrate multiple sub-agents running in cloud sandboxes. Supports parallel task execution, dependency management, and inter-agent coordination.

## Use Cases

1. **Parallel Development**: Spawn multiple agents to work on different parts of a codebase simultaneously
2. **Task Distribution**: Break down complex tasks and assign to specialized agents
3. **Review Coordination**: Have one agent write code while another reviews
4. **Test Automation**: Run tests in parallel across different environments

## Quick Start

```bash
# Spawn a sub-agent to work on a specific task
cmux-devbox orchestrator spawn --agent claude/haiku-4.5 --repo owner/repo "Fix the auth bug in login.ts"

# Check status of spawned agents
cmux-devbox orchestrator list

# Wait for an agent to complete
cmux-devbox orchestrator wait <task-run-id>

# Send a message to a running agent
cmux-devbox orchestrator message <task-run-id> "Please also update the tests"

# Cancel a running agent
cmux-devbox orchestrator cancel <task-run-id>
```

## Commands

### Spawn Agent

Spawn a new sub-agent in a sandbox to work on a task.

```bash
cmux-devbox orchestrator spawn [flags] "prompt"

# Flags:
#   --agent <name>     Agent to use (default: claude/haiku-4.5)
#   --repo <owner/repo> GitHub repository to clone
#   --branch <name>    Branch to checkout (default: main)
#   --env <key=value>  Environment variables (can repeat)
#   --priority <n>     Task priority (0 = highest, default: 5)
#   --depends-on <id>  Task run ID this depends on (can repeat)
#   --wait             Wait for completion before returning
#   --json             Output result as JSON
```

**Examples:**

```bash
# Simple spawn
cmux-devbox orchestrator spawn --agent claude/haiku-4.5 --repo owner/repo "Add input validation to the API"

# Spawn with dependencies
cmux-devbox orchestrator spawn \
  --agent codex/gpt-5.1-codex-mini \
  --depends-on ns7abc123 \
  "Write tests for the changes made in the previous task"

# Spawn and wait for completion
cmux-devbox orchestrator spawn --wait --agent claude/sonnet-4.5 "Review and fix security issues"
```

### List Agents

List all spawned sub-agents and their status.

```bash
cmux-devbox orchestrator list [flags]

# Flags:
#   --status <state>   Filter by status (pending, running, completed, failed)
#   --json             Output as JSON
```

### Get Agent Status

Get detailed status of a specific agent.

```bash
cmux-devbox orchestrator status <task-run-id> [flags]

# Flags:
#   --logs             Include recent logs
#   --json             Output as JSON
```

### Wait for Agent

Wait for an agent to complete (or timeout).

```bash
cmux-devbox orchestrator wait <task-run-id> [flags]

# Flags:
#   --timeout <ms>     Timeout in milliseconds (default: 300000 = 5 min)
#   --poll <ms>        Poll interval (default: 5000 = 5 sec)
```

### Send Message

Send a message to a running agent via the mailbox.

```bash
cmux-devbox orchestrator message <task-run-id> "message" [flags]

# Flags:
#   --type <type>      Message type: handoff, request, status (default: request)
```

### Cancel Agent

Cancel a running agent.

```bash
cmux-devbox orchestrator cancel <task-run-id> [flags]

# Flags:
#   --force            Force stop without cleanup
```

## Orchestration Patterns

### 1. Sequential Pipeline

Run agents in sequence where each depends on the previous.

```bash
# Step 1: Implement feature
RUN1=$(cmux-devbox orchestrator spawn --json --agent claude/sonnet-4.5 "Implement user authentication" | jq -r '.taskRunId')

# Step 2: Write tests (depends on step 1)
RUN2=$(cmux-devbox orchestrator spawn --json --depends-on $RUN1 --agent codex/gpt-5.1-codex-mini "Write tests for auth" | jq -r '.taskRunId')

# Step 3: Review (depends on step 2)
cmux-devbox orchestrator spawn --wait --depends-on $RUN2 --agent claude/opus-4.5 "Review the implementation and tests"
```

### 2. Parallel Fan-Out

Spawn multiple agents to work on independent tasks.

```bash
# Spawn multiple agents in parallel
cmux-devbox orchestrator spawn --agent claude/haiku-4.5 "Fix bug in auth.ts" &
cmux-devbox orchestrator spawn --agent claude/haiku-4.5 "Fix bug in api.ts" &
cmux-devbox orchestrator spawn --agent claude/haiku-4.5 "Fix bug in db.ts" &
wait

# Wait for all to complete
cmux-devbox orchestrator list --status running --json | jq -r '.[].taskRunId' | while read id; do
  cmux-devbox orchestrator wait $id
done
```

### 3. Leader-Worker Pattern

One agent coordinates, others execute.

```bash
# Create a plan as the leader agent
PLAN=$(cmux-devbox orchestrator spawn --wait --json --agent claude/opus-4.5 \
  "Analyze the codebase and create a plan for adding user roles. Output a JSON with tasks array." | jq -r '.result')

# Parse plan and spawn workers
echo $PLAN | jq -r '.tasks[]' | while read task; do
  cmux-devbox orchestrator spawn --agent claude/haiku-4.5 "$task"
done
```

### 4. Review Loop

Implementation and review in parallel.

```bash
# Implement
RUN1=$(cmux-devbox orchestrator spawn --json --agent claude/sonnet-4.5 "Implement feature X" | jq -r '.taskRunId')

# Wait for implementation
cmux-devbox orchestrator wait $RUN1

# Review
cmux-devbox orchestrator spawn --wait --agent claude/opus-4.5 \
  "Review the changes from task run $RUN1. Check for bugs, security issues, and code quality."
```

## Memory Structure

Orchestration data is stored at `/root/lifecycle/memory/orchestration/`:

```
orchestration/
├── PLAN.json       # Current orchestration plan
├── AGENTS.json     # Spawned sub-agents registry
└── EVENTS.jsonl    # Event log for debugging
```

### PLAN.json

Stores the orchestration plan for the current workflow.

```json
{
  "version": 1,
  "createdAt": "2025-02-23T12:00:00Z",
  "status": "running",
  "headAgent": "claude/opus-4.5",
  "description": "Implement user authentication feature",
  "tasks": [
    {
      "id": "task_001",
      "prompt": "Implement auth endpoints",
      "agentName": "claude/sonnet-4.5",
      "status": "completed",
      "taskRunId": "ns7abc123"
    },
    {
      "id": "task_002",
      "prompt": "Write auth tests",
      "agentName": "codex/gpt-5.1-codex-mini",
      "status": "running",
      "dependsOn": ["task_001"],
      "taskRunId": "ns7def456"
    }
  ]
}
```

### AGENTS.json

Tracks all spawned agents for this orchestration session.

```json
{
  "version": 1,
  "agents": [
    {
      "taskRunId": "ns7abc123",
      "agentName": "claude/sonnet-4.5",
      "status": "completed",
      "spawnedAt": "2025-02-23T12:00:00Z",
      "completedAt": "2025-02-23T12:15:00Z",
      "prompt": "Implement auth endpoints",
      "sandboxId": "morphvm_abc123"
    }
  ]
}
```

### EVENTS.jsonl

Append-only log of orchestration events.

```jsonl
{"timestamp":"2025-02-23T12:00:00Z","event":"agent_spawned","agentName":"claude/sonnet-4.5","taskRunId":"ns7abc123"}
{"timestamp":"2025-02-23T12:15:00Z","event":"agent_completed","taskRunId":"ns7abc123","status":"completed"}
{"timestamp":"2025-02-23T12:15:01Z","event":"message_sent","from":"head","to":"ns7def456","type":"handoff"}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CMUX_ORCHESTRATION_MODE` | Set to `1` when running as orchestrator |
| `CMUX_HEAD_AGENT` | Name of the head agent coordinating |
| `CMUX_ORCHESTRATION_ID` | Unique ID for this orchestration session |
| `CMUX_PARENT_TASK_RUN_ID` | Parent task run ID (for nested orchestration) |

## Best Practices

1. **Use specialized agents**: Assign tasks to agents that are good at them (e.g., haiku for quick fixes, opus for complex reasoning)

2. **Set reasonable timeouts**: Don't wait forever - use `--timeout` to prevent stuck workflows

3. **Handle failures gracefully**: Check agent status and have fallback plans

4. **Use dependencies wisely**: Only add dependencies when truly needed to maximize parallelism

5. **Keep prompts focused**: Each sub-agent should have a clear, specific task

6. **Monitor with events log**: Check `EVENTS.jsonl` when debugging coordination issues

## Integration with MCP

When running as a head agent with MCP, you can use these tools programmatically:

```typescript
// Example MCP tool calls
await spawn_agent({
  agentName: "claude/haiku-4.5",
  repo: "owner/repo",
  prompt: "Fix the bug"
});

const status = await get_agent_status({ taskRunId: "ns7abc123" });

await send_message({
  taskRunId: "ns7abc123",
  message: "Please also check the edge cases",
  type: "request"
});
```

## Creating Symlinks

To use this skill with other agents:

```bash
mkdir -p .claude/skills
ln -s ../../.agents/skills/cmux-devbox-orchestrator .claude/skills/cmux-devbox-orchestrator
```
