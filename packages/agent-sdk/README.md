# @cmux/agent-sdk

Unified Agent SDK for cmux - spawn Claude, Codex, Gemini, Amp, and Opencode agents in remote sandboxes.

## Features

- **Multi-agent support**: Claude, Codex, Gemini, Amp, Opencode
- **Multi-provider support**: PVE-LXC, Morph, E2B, Modal, Local
- **Unified API**: Same interface for all agents and providers
- **Session resumption**: Continue conversations across sandbox instances
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
});
```

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
import { spawn, stream, resume } from '@cmux/agent-sdk';

const task = await spawn({ agent: "claude/opus-4.5", prompt: "..." });

for await (const event of stream({ agent: "codex/gpt-5.4", prompt: "..." })) {
  // ...
}

const result = await resume({ sessionId: "...", message: "..." });
```

## Requirements

- Node.js 20+
- `devsh` CLI installed and in PATH

## License

MIT
