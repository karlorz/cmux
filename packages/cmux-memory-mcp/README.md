# @cmux/memory-mcp

MCP server for cmux agent memory - enables Claude Desktop, Cursor, and other MCP clients to access sandbox agent memory.

## Installation

```bash
npm install -g @cmux/memory-mcp
# or
npx @cmux/memory-mcp
```

## Usage

### CLI

```bash
# Use default memory directory (/root/lifecycle/memory)
cmux-memory-mcp

# Specify custom directory
cmux-memory-mcp --dir /path/to/memory

# Set agent name for messaging
cmux-memory-mcp --agent my-agent
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cmux-memory": {
      "command": "npx",
      "args": ["@cmux/memory-mcp"]
    }
  }
}
```

With custom options:

```json
{
  "mcpServers": {
    "cmux-memory": {
      "command": "npx",
      "args": ["@cmux/memory-mcp", "--dir", "/path/to/memory", "--agent", "claude-desktop"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `read_memory` | Read knowledge, tasks, or mailbox memory |
| `list_daily_logs` | List available daily log dates |
| `read_daily_log` | Read a specific daily log |
| `search_memory` | Search across all memory files |
| `send_message` | Send a message to another agent |
| `get_my_messages` | Get messages addressed to this agent |
| `mark_read` | Mark a message as read |

## Memory Directory Structure

```
/root/lifecycle/memory/
├── knowledge/
│   └── MEMORY.md       # Long-term insights
├── daily/
│   └── {date}.md       # Daily session logs
├── TASKS.json          # Task registry
└── MAILBOX.json        # Inter-agent messages
```
