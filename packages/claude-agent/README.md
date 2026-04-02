# @cmux/claude-agent

> **DEPRECATED**: This package is deprecated. Use [`@cmux/agent-sdk`](../agent-sdk) instead, which provides unified support for multiple agent backends (Claude, Codex, Gemini, Amp, Opencode) and sandbox providers.

---

cmux wrapper for the Claude Agent SDK - route sub-agent execution to remote sandboxes.

## Overview

This package wraps the official `@anthropic-ai/claude-agent-sdk` and adds support for executing sub-agents in isolated cmux sandboxes via `devsh`. It enables:

- **Remote execution**: Run agent tasks in PVE-LXC, Morph, E2B, or Modal sandboxes
- **Context isolation**: Each sub-agent gets fresh context in its own sandbox
- **Parallel execution**: Multiple workers can run concurrently across sandboxes
- **Native integration**: Works with Claude Agent SDK's `Agent` tool pattern

## Installation

```bash
npm install @cmux/claude-agent @anthropic-ai/claude-agent-sdk
# Also ensure devsh is installed
npm install -g devsh
```

## Usage

### Full Agent Query with Sandbox Workers

```typescript
import { query } from "@cmux/claude-agent";

for await (const msg of query("Refactor auth module and add tests", {
  allowedTools: ["Read", "Grep", "Agent"],
  agents: {
    "code-worker": {
      description: "Execute code tasks in isolated sandbox",
      sandbox: {
        provider: "pve-lxc",
        repo: "owner/repo",
        branch: "main",
      },
      tools: ["Read", "Edit", "Bash", "Grep", "Glob"],
    },
    "test-runner": {
      description: "Run tests in sandbox",
      sandbox: {
        provider: "morph",
        repo: "owner/repo",
      },
      tools: ["Bash", "Read"],
    },
  },
})) {
  switch (msg.type) {
    case "text":
      console.log(msg.content);
      break;
    case "sandbox_spawn":
      console.log(`Spawning sandbox: ${msg.taskId}`);
      break;
    case "sandbox_result":
      console.log(`Result from ${msg.taskId}:`, msg.result.result);
      break;
    case "done":
      console.log("Final result:", msg.result);
      break;
  }
}
```

### Direct Sandbox Execution

```typescript
import { executeSandbox } from "@cmux/claude-agent";

const result = await executeSandbox("Run tests and fix any failures", {
  provider: "pve-lxc",
  repo: "owner/repo",
  timeoutMs: 300000, // 5 minutes
});

console.log("Exit code:", result.exitCode);
console.log("Result:", result.result);
```

### Reusable Agent Factory

```typescript
import { createAgent } from "@cmux/claude-agent";

const reviewer = createAgent({
  description: "Code review specialist",
  prompt: `You are an expert code reviewer. Focus on:
- Security vulnerabilities
- Performance issues
- Code quality and maintainability`,
  sandbox: {
    provider: "pve-lxc",
    repo: "owner/repo",
  },
  tools: ["Read", "Grep", "Glob"],
});

const review = await reviewer.execute("Review the authentication module");
console.log(review.result);
```

## Configuration

### Sandbox Providers

| Provider  | Description                    |
| --------- | ------------------------------ |
| `pve-lxc` | Proxmox VE LXC containers      |
| `morph`   | Morph cloud sandboxes          |
| `e2b`     | E2B sandboxes                  |
| `modal`   | Modal cloud functions          |

### Sandbox Config Options

```typescript
interface CmuxSandboxConfig {
  provider: "pve-lxc" | "morph" | "e2b" | "modal";
  repo?: string; // GitHub repo in owner/repo format
  branch?: string; // Default: "main"
  snapshotId?: string; // Provider-specific snapshot/template
  workDir?: string; // Default: "/root/workspace"
  timeoutMs?: number; // Default: 600000 (10 minutes)
  env?: Record<string, string>; // Environment variables
}
```

## Requirements

- Node.js 20+
- `devsh` CLI installed and configured
- Valid cmux authentication (for sandbox providers)

## Migration to @cmux/agent-sdk

Replace this package with the unified SDK:

```bash
npm uninstall @cmux/claude-agent
npm install @cmux/agent-sdk
```

Update your imports:

```typescript
// Before
import { query, executeSandbox } from "@cmux/claude-agent";

// After
import { createClient } from "@cmux/agent-sdk";

const client = createClient();

// spawn() replaces executeSandbox()
const task = await client.spawn({
  agent: "claude/opus-4.5",
  prompt: "Your task here",
  provider: "pve-lxc",
  repo: "owner/repo",
});

// stream() replaces query()
for await (const event of client.stream({
  agent: "claude/opus-4.5",
  prompt: "Your task here",
  provider: "pve-lxc",
})) {
  // Handle unified events
}
```

## License

MIT
