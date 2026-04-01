---
name: devsh-orchestrator
description: Multi-agent orchestration skill for spawning and coordinating sub-agents in sandboxes. Enables head agents (like Claude Code CLI) to manage parallel task execution, dependency management, and coordination.
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

# Stream live orchestration events for the task
devsh orchestrate debug <orch-task-id> --events

# Send steering guidance to the running worker
devsh orchestrate message <task-run-id> "Focus on the failing API test first" --type request

# Retry a failed PR/check workflow on the original task branch
devsh task retry <task-id>

# Wait for completion
devsh orchestrate wait <orch-task-id>

# Get aggregated results from an orchestration session
# Requires an orchestration session ID from a flow that creates one
devsh orchestrate results <orchestration-id>
```

## Default Portable Workflow

For small, reliable workflows, prefer this portable pattern:

1. Plan locally in your current workspace
2. Keep any `.claude/plans/*.md` file as a **local convenience**
3. Embed the relevant plan content into the `devsh orchestrate spawn` prompt
4. Track execution with `status --watch` using `<orch-task-id>`
5. Use `debug --events <orch-task-id>` for live orchestration insight
6. Use `message <task-run-id>` to steer a running worker
7. Use `task retry <task-id>` for failed PR/check workflows
8. Use `results <orchestration-id>` only when your workflow actually has an orchestration session ID

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

### Batch Spawn (Multiple Agents)

Spawn multiple agents from a YAML/JSON specification with dependency management.

```bash
devsh orchestrate spawn-batch <file|-|json> [flags]

# Flags:
#   --sync              Wait for all tasks to complete
#   --dry-run           Show execution plan without spawning
#   --parallel <n>      Max parallel spawns per batch (0 = unlimited)
#   --timeout <dur>     Timeout for --sync mode (default: 30m)
#   --use-env-jwt       Use CMUX_TASK_RUN_JWT for auth
#   --json              Output result as JSON
```

**YAML Schema:**

```yaml
tasks:
  - id: design
    prompt: "Design the API schema"
    agent: claude/opus-4.6
  - id: implement
    prompt: "Implement the API"
    agent: codex/gpt-5.4-xhigh
    depends_on: [design]
  - id: test
    prompt: "Write tests"
    agent: codex/gpt-5.1-codex-mini
    depends_on: [implement]
    priority: 3

defaults:
  repo: owner/repo
  branch: main
```

**Examples:**

```bash
# Show execution plan without spawning
devsh orchestrate spawn-batch tasks.yaml --dry-run

# Spawn all tasks
devsh orchestrate spawn-batch tasks.yaml

# Spawn and wait for completion
devsh orchestrate spawn-batch tasks.yaml --sync

# Inline JSON
devsh orchestrate spawn-batch '[{"id":"t1","prompt":"Task","agent":"claude/haiku-4.5"}]'
```

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

### Stream Live Orchestration Events

Inspect live orchestration updates for a spawned task.

```bash
devsh orchestrate debug <orch-task-id> --events
```

`debug --events` accepts the **orchestration task ID** printed by `spawn`. It resolves the best available stream key automatically:
- grouped workflows: uses the orchestration session ID from task metadata
- single local CLI workflows: falls back to the task's own orchestration task ID

Use it when `status --watch` is not enough and you need live triage detail. On failures it points to the next likely operator actions:
- `devsh orchestrate message <task-run-id> ...` for mid-run steering
- `devsh task retry <task-id>` for failed PR/check workflows
- `devsh orchestrate results <orchestration-id>` only when a real orchestration session ID exists

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
| `CMUX_AUTO_SPAWN_ENABLED` | Set to `1` when auto-spawn sub-agents is enabled in team settings |
| `CMUX_DEFAULT_CODING_AGENT` | Default agent model for spawned sub-agents (e.g., `codex/gpt-5.1-codex-mini`) |
| `CMUX_MAX_CONCURRENT_SUBAGENTS` | Maximum number of concurrent sub-agents allowed |
| `CMUX_MAX_TASK_DURATION_MINUTES` | Maximum duration in minutes for sub-agent tasks |

### Auto-Spawn Settings

When `CMUX_AUTO_SPAWN_ENABLED=1` is set, head agents can spawn sub-agents using the `spawn_agent` MCP tool. The settings are configured via the Orchestration Settings UI:

- **Auto-Spawn Sub-Agents toggle**: Enables/disables the auto-spawn capability
- **Default Coding Agent**: The preferred agent model for delegated coding tasks
- **Max Concurrent Sub-Agents**: Limits parallel sub-agent execution
- **Max Task Duration**: Timeout for sub-agent tasks

Example usage in a head agent:

```typescript
if (process.env.CMUX_AUTO_SPAWN_ENABLED === "1") {
  const defaultAgent = process.env.CMUX_DEFAULT_CODING_AGENT || "codex/gpt-5.1-codex-mini";
  await spawn_agent({
    prompt: "Implement the feature",
    agentName: defaultAgent,
  });
}
```

## Fractal Agency: Headless Remote Execution

### How Remote Workers Actually Run

When you spawn a sub-agent, the remote sandbox doesn't run a custom cmux worker script. It runs the **exact same native CLI** (Claude Code or Codex CLI) in headless mode:

- **Claude Code**: `claude --print --yes --json "Your prompt here"`
- **Codex CLI**: `codex exec "Your prompt here"` with full autonomy

This is called **Fractal Agency** — the local mastermind delegates to remote copies of itself.

### Sandbox Security Model

Remote sandboxes are **fully disposable and maximally permissive**:

1. **API keys are never exposed** — sandboxes receive a proxy URL + placeholder key. The real key is injected server-side by the Convex proxy.
2. **Full tool permissions** — `.claude/settings.json` in the sandbox allows all commands. If the agent destroys the sandbox, it only destroys a temporary clone.
3. **Fire-and-forget** — if a worker fails or goes wrong, kill it (`orchestrate cancel`) and re-spawn with an adjusted prompt. No mid-flight steering needed.

### Backend Selection

Choose the backend based on your task:

| Backend | When to use | Spawn time |
|---------|-------------|------------|
| `pve-lxc` (default) | Most tasks. Fast spawn, good isolation. | ~30s |
| `morph` | Pre-baked snapshots with warm repos. Fastest for repeat work on same codebase. | ~15s |
| `--cloud-workspace` | When the spawned agent needs to be an orchestration head itself (nested coordination). | ~45s |

Backend is auto-detected from environment. To force a specific backend:
```bash
devsh orchestrate spawn --provider pve-lxc --agent claude/haiku-4.5 "Task"
devsh orchestrate spawn --provider morph --agent codex/gpt-5.1-codex-mini "Task"
```

### Result Collection Pattern

Standard pattern for spawn-wait-collect:

```bash
# 1. Spawn and capture the task ID
TASK_ID=$(devsh orchestrate spawn --agent claude/opus-4.6 --repo owner/repo "Implement feature X" --json | jq -r '.OrchestrationTaskID')

# 2. Wait for completion (blocks until terminal state)
devsh orchestrate wait $TASK_ID --timeout 600

# 3. Collect the result
RESULT=$(devsh orchestrate status $TASK_ID --json | jq '{status: .Task.Status, result: .Task.Result, error: .Task.ErrorMessage, pr: .TaskRun.PullRequestURL}')
echo "$RESULT"
```

### Failure Handling: Kill and Re-Spawn

When a worker fails or goes down the wrong path:

```bash
# Check why it failed
devsh orchestrate status $TASK_ID --json | jq '.Task.ErrorMessage'

# Cancel if still running
devsh orchestrate cancel $TASK_ID

# Re-spawn with adjusted prompt
NEW_TASK_ID=$(devsh orchestrate spawn --agent claude/opus-4.6 --repo owner/repo \
  "Implement feature X. NOTE: Previous attempt failed because of Y. Avoid Z." --json | jq -r '.OrchestrationTaskID')
```

This "fail fast, re-spawn" pattern is simpler than mid-flight steering and matches the disposable sandbox philosophy.

## Best Practices

1. **Prefer the portable default first**: local planning plus inline prompt delegation is the safest default workflow
2. **Use specialized agents**: haiku for quick fixes, opus for complex reasoning, codex for implementation-heavy tasks
3. **Monitor with polling first**: `status --watch` is polling watch mode
4. **Escalate to live triage when needed**: `debug --events` is the operator-facing event stream for live orchestration insight
5. **Use the right ID**: `<orch-task-id>` for status/debug/wait/cancel, `<task-run-id>` for message, `<task-id>` for `task retry`, `<orchestration-id>` for results
6. **Use advanced head-agent paths intentionally**: `--cloud-workspace`, `--use-env-jwt`, `pull_orchestration_updates`, and `orchestrate migrate` are advanced workflow options
7. **Keep prompts focused**: each sub-agent should have a clear, specific task
8. **Embrace fire-and-forget**: if a worker fails, analyze the error and re-spawn with a better prompt rather than trying to steer mid-flight

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
