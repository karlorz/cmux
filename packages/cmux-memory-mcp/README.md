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

### Read Tools

| Tool | Description |
|------|-------------|
| `read_memory` | Read knowledge, tasks, or mailbox memory |
| `list_daily_logs` | List available daily log dates |
| `read_daily_log` | Read a specific daily log |
| `search_memory` | Search across all memory files |

### Messaging Tools

| Tool | Description |
|------|-------------|
| `send_message` | Send a message to another agent (or "*" for broadcast) |
| `get_my_messages` | Get messages addressed to this agent |
| `mark_read` | Mark a message as read |

### Write Tools

| Tool | Description |
|------|-------------|
| `append_daily_log` | Append content to today's daily log |
| `update_knowledge` | Add an entry to a priority section (P0/P1/P2) |
| `add_task` | Add a new task to TASKS.json |
| `update_task` | Update the status of a task |

### Orchestration Tools

| Tool | Description |
|------|-------------|
| `read_orchestration` | Read PLAN.json, AGENTS.json, or EVENTS.jsonl |
| `append_event` | Append an orchestration event to EVENTS.jsonl |
| `update_plan_task` | Update task status in PLAN.json |

## Memory Directory Structure

```
/root/lifecycle/memory/
├── knowledge/
│   └── MEMORY.md         # Long-term insights (P0/P1/P2 sections)
├── daily/
│   └── {date}.md         # Daily session logs
├── orchestration/
│   ├── PLAN.json         # Orchestration task plan
│   ├── AGENTS.json       # Agent registry
│   └── EVENTS.jsonl      # Orchestration event log
├── TASKS.json            # Task registry
└── MAILBOX.json          # Inter-agent messages
```

## Priority Tiers (MEMORY.md)

- **P0 - Core**: Never expires. Project fundamentals, invariants.
- **P1 - Active**: 90-day TTL. Ongoing work, current strategies.
- **P2 - Reference**: 30-day TTL. Temporary findings, debug notes.

Format: `- [YYYY-MM-DD] Your insight here`
