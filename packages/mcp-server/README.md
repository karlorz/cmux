# @cmux/mcp-server

MCP (Model Context Protocol) server exposing cmux agent orchestration tools to Claude Code and other MCP-compatible clients.

## Installation

```bash
npm install @cmux/mcp-server
# or
bun add @cmux/mcp-server
```

## Quick Start

### As a CLI

```bash
# Run the MCP server (communicates via stdio)
npx cmux-mcp-server

# Or with custom devsh path
CMUX_DEVSH_PATH=/path/to/devsh npx cmux-mcp-server
```

### Configure in Claude Code

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "cmux": {
      "command": "npx",
      "args": ["cmux-mcp-server"]
    }
  }
}
```

Or if devsh is installed locally:

```json
{
  "mcpServers": {
    "cmux": {
      "command": "npx",
      "args": ["cmux-mcp-server"],
      "env": {
        "CMUX_DEVSH_PATH": "/usr/local/bin/devsh"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `cmux_spawn` | Spawn a new agent task in a remote sandbox |
| `cmux_status` | Get the current status of a task |
| `cmux_wait` | Wait for a task to complete |
| `cmux_cancel` | Cancel a running task |
| `cmux_results` | Get full results of a completed task |
| `cmux_inject` | Inject a message into a running session |
| `cmux_checkpoint` | Create a checkpoint of task state |
| `cmux_migrate` | Migrate a session to another provider |
| `cmux_list` | List recent orchestration tasks |

## Tool Usage Examples

### Spawn an agent

```
Use cmux_spawn to start a Claude agent:
- agent: "claude/opus-4.5"
- prompt: "Review the auth module for security issues"
- provider: "pve-lxc"
- repo: "owner/repo"
```

### Wait for completion

```
Use cmux_wait to wait for the task:
- taskId: "task_abc123"
- timeoutMs: 300000
```

### Get results

```
Use cmux_results to get the full output:
- taskId: "task_abc123"
```

## Supported Agents

- `claude/opus-4.5`, `claude/opus-4.6`, `claude/sonnet-4.6`, `claude/haiku-4.5`
- `codex/gpt-5.4`, `codex/gpt-5.1-codex-mini`
- `gemini/2.5-pro`, `gemini/2.5-flash`
- `amp/*`, `opencode/*`

## Supported Providers

- `pve-lxc` - Proxmox VE LXC containers
- `morph` - Morph cloud VMs
- `e2b` - E2B sandboxes
- `modal` - Modal containers
- `local` - Local execution

## Programmatic Usage

```typescript
import { createServer, DevshExecutor } from '@cmux/mcp-server';

// Create and run server
const server = createServer({ devshPath: '/usr/local/bin/devsh' });
await server.run();

// Or use executor directly
const executor = new DevshExecutor({ devshPath: 'devsh' });
const result = await executor.spawn({
  agent: 'claude/opus-4.5',
  prompt: 'Fix the bug in auth.ts',
  provider: 'pve-lxc',
});
```

## Requirements

- Node.js 18+
- `devsh` CLI installed and in PATH (or specified via `CMUX_DEVSH_PATH`)
- Valid cmux authentication (`devsh whoami` should succeed)

## License

MIT
