---
name: devsh-orchestrator
description: Multi-agent orchestration skill for spawning and coordinating sub-agents in sandboxes. Enables head agents (like Claude Code CLI) to manage parallel task execution, dependency management, and coordination.
---

# devsh-orchestrator - Multi-Agent Orchestration Skill

> **Purpose**: Enable head agents (like Claude Code CLI running locally or in cloud workspaces) to orchestrate multiple sub-agents running in cloud sandboxes. Supports parallel task execution, dependency management, polling watch mode, and inter-agent coordination.

## Use Cases

1. **Parallel Development**: Spawn multiple agents to work on different parts of a codebase simultaneously
2. **Task Distribution**: Break down complex tasks and assign them to specialized agents
3. **Review Coordination**: Have one agent write code while another reviews
4. **Test Automation**: Run tests in parallel across different environments
5. **Advanced Head-Agent Mode**: Run as a cloud workspace that coordinates sub-agents

## Quick Start

```bash
# Spawn a sub-agent to work on a specific task
devsh orchestrate spawn --agent claude/haiku-4.5 --repo owner/repo "Fix the auth bug in login.ts"

# Check status of the spawned task with polling watch mode
devsh orchestrate status <orch-task-id> --watch

# Wait for completion
devsh orchestrate wait <orch-task-id>

# Cancel an orchestration task
devsh orchestrate cancel <orch-task-id>

# Get aggregated results from an orchestration session
# Requires an orchestration session ID from a flow that creates one
devsh orchestrate results <orchestration-id>
```

## Default Portable Workflow

For small, reliable workflows, prefer this portable pattern:

1. Plan locally in your current workspace
2. Keep any `.claude/plans/*.md` file as a **local convenience**
3. Embed the relevant plan content into the `devsh orchestrate spawn` prompt
4. Track execution with `status`, `wait`, and `cancel` using `<orch-task-id>`
5. Use `results <orchestration-id>` only when your workflow actually has an orchestration session ID

This avoids assuming the spawned sandbox can read a local plan path from your machine.

## Commands

### Spawn Agent

Spawn a new sub-agent in a sandbox to work on a task.

```bash
devsh orchestrate spawn [flags] "prompt"

# Flags:
#   --agent <name>        Agent to use (required)
#   --repo <owner/repo>   GitHub repository to clone
#   --branch <name>       Branch to checkout
#   --pr-title <title>    Pull request title
#   --priority <n>        Task priority (0 = highest, default: 5)
#   --depends-on <id>     Orchestration task ID this depends on (can repeat)
#   --use-env-jwt         Use CMUX_TASK_RUN_JWT for auth (for sub-agent spawning)
#   --cloud-workspace     Spawn as cloud-workspace head agent (advanced)
#   --json                Output result as JSON
```

**Examples:**

```bash
# Simple spawn
devsh orchestrate spawn --agent claude/haiku-4.5 --repo owner/repo "Add input validation to the API"

# Spawn with dependencies
devsh orchestrate spawn \
  --agent codex/gpt-5.1-codex-mini \
  --depends-on <orch-task-id> \
  "Write tests for the changes made in the previous task"

# Spawn from within a head agent (uses JWT auth)
devsh orchestrate spawn --use-env-jwt --agent claude/haiku-4.5 "Sub-task from coordinator"
```

**Portable prompt pattern:**

```bash
PLAN_CONTENT=$(cat .claude/plans/task-name.md)

devsh orchestrate spawn \
  --agent codex/gpt-5.1-codex-mini \
  --repo owner/repo \
  --branch feature-branch \
  "Implement the following plan:

$PLAN_CONTENT"
```

For large plans, inline only the relevant excerpt or a tight summary instead of copying the entire file into one command argument.

### Get Orchestration Task Status

Get detailed status of a specific orchestration task.

```bash
devsh orchestrate status <orch-task-id> [flags]

# Flags:
#   --watch, -w           Continuously poll status until terminal state
#   --interval <seconds>  Polling interval for watch mode (default: 3)
#   --json                Output as JSON
```

**Watch Mode:**

Watch mode is a **polling watch mode** that refreshes task status until the task reaches a terminal state.

```bash
# Monitor task with watch mode
devsh orchestrate status <orch-task-id> --watch

# Custom polling interval
devsh orchestrate status <orch-task-id> --watch --interval 5
```

### Get Orchestration Results

Get aggregated results from all sub-agents in an orchestration session.

```bash
devsh orchestrate results <orchestration-id> [flags]

# Flags:
#   --use-env-jwt  Use CMUX_TASK_RUN_JWT for auth (for head agents)
#   --json         Output as JSON
```

**Examples:**

```bash
# Get results for an orchestration
devsh orchestrate results <orchestration-id>

# Get results as JSON
devsh orchestrate results <orchestration-id> --json

# Get results from within a head agent
devsh orchestrate results <orchestration-id> --use-env-jwt
```

### List Agents

List all spawned sub-agents and their status.

```bash
devsh orchestrate list [flags]

# Flags:
#   --status <state>   Filter by status (pending, running, completed, failed)
#   --json             Output as JSON
```

### Wait for Orchestration Task

Wait for an orchestration task to complete.

```bash
devsh orchestrate wait <orch-task-id> [flags]

# Flags:
#   --timeout <duration>  Timeout duration (default: 5m)
#   --json                Output as JSON
```

### Send Message

Send a message to a running agent via the mailbox.

```bash
devsh orchestrate message <task-run-id> "message" [flags]

# Flags:
#   --type <type>      Message type: handoff, request, status (required)
```

### Cancel Orchestration Task

Cancel an orchestration task.

```bash
devsh orchestrate cancel <orch-task-id>
```

## Advanced Head-Agent Paths

These are valid, stronger orchestration paths, but they are **advanced** compared with the default portable workflow.

### Cloud Workspace Head Agent

Cloud workspaces spawned with `--cloud-workspace` act as orchestration head agents that coordinate multiple sub-agents.

```bash
devsh orchestrate spawn --cloud-workspace --agent claude/opus-4.6 "Coordinate feature implementation"
```

Head agents receive:

1. **Special environment variables**
   - `CMUX_IS_ORCHESTRATION_HEAD=1`
   - `CMUX_ORCHESTRATION_ID`
2. **Head-agent instructions**
   - `/root/lifecycle/memory/orchestration/HEAD_AGENT_INSTRUCTIONS.md`
3. **JWT-based orchestration access**
   - `--use-env-jwt`
4. **Server sync support**
   - `pull_orchestration_updates`

### Migrate-Backed Head Agent

`devsh orchestrate migrate` uploads local orchestration state and starts a sandboxed head agent that can continue the workflow remotely.

```bash
devsh orchestrate migrate --plan-file ./PLAN.json
```

This is one of the flows that provides both:
- `Orchestration ID`
- `Orchestration Task ID`

### pull_orchestration_updates

Head agents can sync their local PLAN.json with the server state using MCP:

```typescript
const updates = await pull_orchestration_updates({
  orchestrationId: "orch_abc123" // optional - uses CMUX_ORCHESTRATION_ID when omitted
});
```

## Orchestration Patterns

### 1. Sequential Pipeline

```bash
# Step 1: Implement feature
RUN1=$(devsh orchestrate spawn --json --agent claude/sonnet-4.5 "Implement user authentication" | jq -r '.orchestrationTaskId')

# Step 2: Write tests after step 1
devsh orchestrate spawn --json --depends-on "$RUN1" --agent codex/gpt-5.1-codex-mini "Write tests for auth"
```

### 2. Parallel Fan-Out

```bash
# Spawn multiple agents in parallel
devsh orchestrate spawn --agent claude/haiku-4.5 "Fix bug in auth.ts" &
devsh orchestrate spawn --agent claude/haiku-4.5 "Fix bug in api.ts" &
devsh orchestrate spawn --agent claude/haiku-4.5 "Fix bug in db.ts" &
wait
```

### 3. Leader-Worker Pattern

```bash
# Spawn a head agent (advanced)
devsh orchestrate spawn --cloud-workspace --agent claude/opus-4.6 \
  "Analyze the codebase and coordinate implementing user roles across multiple agents"
```

Inside the cloud workspace, the head agent can:

```bash
devsh orchestrate spawn --use-env-jwt --agent claude/haiku-4.5 "Implement role model"
devsh orchestrate spawn --use-env-jwt --agent claude/haiku-4.5 "Add role-based middleware"
devsh orchestrate spawn --use-env-jwt --agent codex/gpt-5.1-codex-mini "Write role tests"

devsh orchestrate status <orch-task-id> --watch
devsh orchestrate results <orchestration-id> --use-env-jwt
```

## Memory Structure

Orchestration data is stored at `/root/lifecycle/memory/orchestration/`:

```text
orchestration/
├── PLAN.json
├── AGENTS.json
├── EVENTS.jsonl
└── HEAD_AGENT_INSTRUCTIONS.md
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CMUX_IS_ORCHESTRATION_HEAD` | Set to `1` when running as orchestration head |
| `CMUX_ORCHESTRATION_ID` | Unique ID for this orchestration session |
| `CMUX_TASK_RUN_JWT` | JWT for authenticating sub-agent spawns |
| `CMUX_HEAD_AGENT` | Name of the head agent coordinating |
| `CMUX_PARENT_TASK_RUN_ID` | Parent task run ID for nested orchestration |

## Best Practices

1. **Prefer the portable default first**: local planning plus inline prompt delegation is the safest default workflow
2. **Use specialized agents**: haiku for quick fixes, opus for complex reasoning, codex for implementation-heavy tasks
3. **Monitor with watch mode**: `status --watch` is polling watch mode
4. **Use the right ID**: `<orch-task-id>` for status/wait/cancel, `<orchestration-id>` for results
5. **Use advanced head-agent paths intentionally**: `--cloud-workspace`, `--use-env-jwt`, `pull_orchestration_updates`, and `orchestrate migrate` are advanced workflow options
6. **Keep prompts focused**: each sub-agent should have a clear, specific task

## Integration with MCP

When running as a head agent with MCP, you can use orchestration tools programmatically via the memory/orchestration server, including:

- `spawn_agent`
- `get_agent_status`
- `list_spawned_agents`
- `wait_for_agent`
- `cancel_agent`
- `get_orchestration_summary`
- `pull_orchestration_updates`
- `send_message`
- `get_my_messages`

## Creating Symlinks

To use this skill with other agents:

```bash
mkdir -p .claude/skills
ln -s ../../.agents/skills/devsh-orchestrator .claude/skills/devsh-orchestrator
```
