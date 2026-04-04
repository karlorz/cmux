# cmux-agent-sdk

Unified Agent SDK for cmux - spawn Claude, Codex, Gemini, Amp, and Opencode agents in remote sandboxes or local execution lanes.

## Features

- **Multi-agent support**: Claude, Codex, Gemini, Amp, Opencode
- **Multi-provider support**: PVE-LXC, Morph, E2B, Modal, Local
- **Unified API**: Same interface for all agents and providers
- **Session resumption**: Continue conversations across sandbox instances
- **Session migration**: Move sessions between providers
- **Parallel execution**: Run multiple agents concurrently with concurrency control
- **Checkpointing**: Save and restore session state
- **Cost tracking**: Token usage and cost estimation
- **Streaming events**: Real-time progress updates

## Installation

```bash
pip install cmux-agent-sdk
# or
uv add cmux-agent-sdk
```

## Quick Start

```python
import asyncio
from cmux_agent_sdk import create_client

async def main():
    client = create_client()

    # Spawn an agent
    task = await client.spawn(
        agent="claude/opus-4.5",
        prompt="Refactor the auth module",
        provider="pve-lxc",
        repo="owner/repo",
    )

    print(f"Task {task.id} completed with status: {task.status}")

asyncio.run(main())
```

## Streaming Events

```python
async for event in client.stream(
    agent="codex/gpt-5.4",
    prompt="Fix the bug in auth.ts",
    provider="morph",
):
    match event.type:
        case "spawn":
            print(f"Task {event.task_id} started on {event.provider}")
        case "text":
            print(event.content)
        case "checkpoint":
            print(f"Checkpoint saved: {event.ref}")
        case "done":
            print(f"Result: {event.result.result}")
```

## Session Resumption

```python
# Initial execution
task = await client.spawn(
    agent="claude/opus-4.5",
    prompt="Start implementing feature X",
    provider="pve-lxc",
)

# Later: resume the session
result = await client.resume(
    session_id=task.session_id,
    message="Now add tests for it",
)
```

## Parallel Execution

Run multiple agents concurrently with optional concurrency limits:

```python
from cmux_agent_sdk import SpawnManyTaskConfig

results = await client.spawn_many(
    tasks=[
        SpawnManyTaskConfig(agent="claude/opus-4.5", prompt="Refactor auth module"),
        SpawnManyTaskConfig(agent="codex/gpt-5.4", prompt="Add test coverage"),
        SpawnManyTaskConfig(agent="gemini/2.5-pro", prompt="Update documentation"),
    ],
    concurrency=2,   # Max 2 agents at once
    fail_fast=False, # Continue even if one fails
)

print(f"Succeeded: {results.succeeded}, Failed: {results.failed}")
```

## Session Migration

Move a session from one provider to another:

```python
# Start on PVE-LXC
task = await client.spawn(
    agent="claude/opus-4.5",
    prompt="Start the work",
    provider="pve-lxc",
)

# Migrate to Morph with a continuation message
result = await client.migrate(
    source=task.session_id,
    target_provider="morph",
    message="Continue the work here",
)
```

## Checkpointing

Create checkpoints to save session state:

```python
checkpoint = await client.checkpoint(task_id=task.id, label="before-refactor")

if checkpoint:
    print(f"Checkpoint {checkpoint.id} created")
    print(f"Resumable: {checkpoint.resumable}")
```

## Cost Tracking

Track token usage and estimate costs:

```python
from cmux_agent_sdk import calculate_cost, get_model_pricing, MODEL_PRICING

# Get pricing for a model
pricing = get_model_pricing("claude/opus-4.5")
# ModelPricing(input_per_million=15, output_per_million=75, ...)

# TaskHandle contains task/session metadata. Use stream(), resume(), or direct helpers for result details.
task = await client.spawn(agent="claude/opus-4.5", prompt="...")
print(task.id)
print(task.status)
```

## Supported Agents

| Backend | Example Models |
|---------|---------------|
| `claude` | `opus-4.5`, `sonnet-4.5`, `haiku-4.5` |
| `codex` | `gpt-5.4`, `gpt-5.4-xhigh`, `gpt-5.1-codex-mini` |
| `gemini` | `2.5-pro`, `2.5-flash` |
| `amp` | `claude-3.5`, `gpt-4o` |
| `opencode` | `big-pickle` |

## Supported Providers

| Provider | Description |
|----------|-------------|
| `pve-lxc` | Proxmox VE LXC containers (default) |
| `morph` | Morph Cloud sandboxes |
| `e2b` | E2B sandboxes |
| `modal` | Modal sandboxes |
| `local` | Local execution (no sandbox) |

## API Reference

### `create_client()`

Create a new cmux client instance.

```python
client = create_client(
    devsh_path="devsh",      # Path to devsh CLI
    api_base_url="...",      # cmux API base URL
    auth_token="...",        # cmux authentication token
)
```

### `client.spawn()`

Spawn an agent in a sandbox and return a `TaskHandle` with task/session metadata.

```python
task = await client.spawn(
    agent="claude/opus-4.5",  # Required: agent ID
    prompt="...",             # Required: task prompt
    provider="pve-lxc",       # Sandbox provider (default: pve-lxc)
    repo="owner/repo",        # GitHub repo to clone
    branch="main",            # Branch to checkout
    snapshot_id="...",        # Provider-specific snapshot ID
    work_dir="/root/workspace", # Working directory
    timeout_ms=600000,        # Timeout (default: 10 minutes)
    env={"KEY": "value"},     # Environment variables
    sync=True,                # Wait for completion (default: True)
    # Claude Agent SDK options (claude/* agents only)
    permission_mode="acceptEdits",        # Tool permission handling
    setting_sources=["user", "project"],  # Settings files to load
    system_prompt={"type": "preset", "preset": "claude_code"},
    allowed_tools=["Read", "Write"],      # Allowed tools
    disallowed_tools=["Bash"],            # Disallowed tools
)
```

#### Claude Agent SDK Options

These options only apply when spawning `claude/*` agents:

| Option | Type | Description |
|--------|------|-------------|
| `permission_mode` | `"default"` \| `"acceptEdits"` \| `"bypassPermissions"` \| `"plan"` \| `"delegate"` \| `"dontAsk"` | How the agent handles permission requests |
| `setting_sources` | `list["user" \| "project" \| "local"]` | Which settings files to load |
| `system_prompt` | `{"type": "preset", "preset": str}` or `{"type": "custom", "content": str}` | System prompt configuration |
| `allowed_tools` | `list[str]` | Tools the agent can use |
| `disallowed_tools` | `list[str]` | Tools the agent cannot use |

### `client.stream()`

Stream events from agent execution.

```python
async for event in client.stream(agent, prompt, **options):
    # Handle events
```

### `client.resume()`

Resume a previous session.

```python
result = await client.resume(
    session_id="...",         # Required: session ID from previous task
    message="...",            # Required: continuation message
    provider="morph",         # Optional: migrate to different provider
)
```

## Direct Functions

For simple use cases without a client:

```python
from cmux_agent_sdk import spawn, stream, resume, spawn_many, checkpoint, migrate

task = await spawn(agent="claude/opus-4.5", prompt="...")

async for event in stream(agent="codex/gpt-5.4", prompt="..."):
    ...

result = await resume(session_id="...", message="...")

parallel = await spawn_many(tasks=[...], concurrency=2)

cp = await checkpoint(task_id="...")

migrated = await migrate(source="...", target_provider="morph")
```

## Requirements

- Python 3.10+
- `devsh` CLI installed and in PATH
- Valid cmux authentication (`devsh whoami` should succeed)

## License

MIT
