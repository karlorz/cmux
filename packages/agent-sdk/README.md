# @cmux/agent-sdk

Unified Agent SDK for cmux - spawn Claude, Codex, Gemini, Amp, and Opencode agents in remote sandboxes.

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
bun add @cmux/agent-sdk
```

## Quick Start

```typescript
import { createClient } from '@cmux/agent-sdk';

const client = createClient();

// Spawn an agent
const task = await client.spawn({
  agent: "claude/opus-4.5",
  prompt: "Refactor the auth module",
  provider: "pve-lxc",
  repo: "owner/repo",
});

console.log(`Task ${task.id} completed with status: ${task.status}`);
```

## Streaming Events

```typescript
for await (const event of client.stream({
  agent: "codex/gpt-5.4",
  prompt: "Fix the bug in auth.ts",
  provider: "morph",
})) {
  switch (event.type) {
    case "spawn":
      console.log(`Task ${event.taskId} started on ${event.provider}`);
      break;
    case "text":
      console.log(event.content);
      break;
    case "checkpoint":
      console.log(`Checkpoint saved: ${event.ref}`);
      break;
    case "done":
      console.log(`Result: ${event.result.result}`);
      break;
  }
}
```

## Session Resumption

```typescript
// Initial execution
const task = await client.spawn({
  agent: "claude/opus-4.5",
  prompt: "Start implementing feature X",
  provider: "pve-lxc",
});

// Later: resume the session
const result = await client.resume({
  sessionId: task.sessionId!,
  message: "Now add tests for it",
});
```

## Parallel Execution

Run multiple agents concurrently with optional concurrency limits:

```typescript
const results = await client.spawnMany({
  tasks: [
    { agent: "claude/opus-4.5", prompt: "Refactor auth module" },
    { agent: "codex/gpt-5.4", prompt: "Add test coverage" },
    { agent: "gemini/2.5-pro", prompt: "Update documentation" },
  ],
  concurrency: 2,  // Max 2 agents at once
  failFast: false, // Continue even if one fails
});

console.log(`Succeeded: ${results.succeeded}, Failed: ${results.failed}`);
```

## Session Migration

Move a session from one provider to another:

```typescript
// Start on PVE-LXC
const task = await client.spawn({
  agent: "claude/opus-4.5",
  prompt: "Start the work",
  provider: "pve-lxc",
});

// Migrate to Morph with a continuation message
const result = await client.migrate({
  source: task.sessionId!,
  targetProvider: "morph",
  message: "Continue the work here",
});
```

## Checkpointing

Create checkpoints to save session state:

```typescript
const checkpoint = await client.checkpoint({
  taskId: task.id,
  label: "before-refactor",
});

if (checkpoint) {
  console.log(`Checkpoint ${checkpoint.id} created`);
  console.log(`Resumable: ${checkpoint.resumable}`);
}
```

## Cost Tracking

Track token usage and estimate costs:

```typescript
import { calculateCost, getModelPricing, MODEL_PRICING } from '@cmux/agent-sdk';

// Get pricing for a model
const pricing = getModelPricing('claude/opus-4.5');
// { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, ... }

// Calculate cost from usage (available in TaskResult.usage)
const task = await client.spawn({ agent: "claude/opus-4.5", prompt: "..." });
if (task.usage) {
  console.log(`Tokens: ${task.usage.tokens.totalTokens}`);
  console.log(`Cost: $${task.usage.cost?.totalCost.toFixed(4)}`);
}
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

### `createClient(options?)`

Create a new cmux client instance.

```typescript
const client = createClient({
  devshPath: "devsh",      // Path to devsh CLI
  apiBaseUrl: "...",       // cmux API base URL
  authToken: "...",        // cmux authentication token
});
```

### `client.spawn(options)`

Spawn an agent in a sandbox.

```typescript
const task = await client.spawn({
  agent: "claude/opus-4.5",  // Required: agent ID
  prompt: "...",             // Required: task prompt
  provider: "pve-lxc",       // Sandbox provider (default: pve-lxc)
  repo: "owner/repo",        // GitHub repo to clone
  branch: "main",            // Branch to checkout
  snapshotId: "...",         // Provider-specific snapshot ID
  workDir: "/root/workspace", // Working directory
  timeoutMs: 600000,         // Timeout (default: 10 minutes)
  env: { KEY: "value" },     // Environment variables
  sync: true,                // Wait for completion (default: true)

  // Claude Agent SDK options (claude/* agents only)
  permissionMode: "acceptEdits",        // Tool permission handling
  settingSources: ["user", "project"],  // Settings files to load
  systemPrompt: { type: "preset", preset: "minimal" }, // System prompt
  allowedTools: ["Read", "Write"],      // Allowed tools
  disallowedTools: ["Bash"],            // Disallowed tools
});
```

#### Claude Agent SDK Options

These options only apply to `claude/*` agents:

| Option | Type | Description |
|--------|------|-------------|
| `permissionMode` | `"default"` \| `"acceptEdits"` \| `"bypassPermissions"` \| `"plan"` \| `"delegate"` \| `"dontAsk"` | How the agent handles permission requests |
| `settingSources` | `("user" \| "project" \| "local")[]` | Which settings files to load |
| `systemPrompt` | `{ type: "preset", preset: "claude_code" \| "minimal" \| "custom" }` or `{ type: "custom", content: string }` | System prompt configuration |
| `allowedTools` | `string[]` | Tools the agent can use |
| `disallowedTools` | `string[]` | Tools the agent cannot use |

### `client.stream(options)`

Stream events from agent execution.

```typescript
for await (const event of client.stream(options)) {
  // Handle events
}
```

### `client.resume(options)`

Resume a previous session.

```typescript
const result = await client.resume({
  sessionId: "...",          // Required: session ID from previous task
  message: "...",            // Required: continuation message
  provider: "morph",         // Optional: migrate to different provider
});
```

## Direct Functions

For simple use cases without a client:

```typescript
import { spawn, stream, resume, spawnMany, checkpoint, migrate } from '@cmux/agent-sdk';

const task = await spawn({ agent: "claude/opus-4.5", prompt: "..." });

for await (const event of stream({ agent: "codex/gpt-5.4", prompt: "..." })) {
  // ...
}

const result = await resume({ sessionId: "...", message: "..." });

const parallel = await spawnMany({ tasks: [...], concurrency: 2 });

const cp = await checkpoint({ taskId: "..." });

const migrated = await migrate({ source: "...", targetProvider: "morph" });
```

## Requirements

- Node.js 20+
- `devsh` CLI installed and in PATH

## License

MIT
