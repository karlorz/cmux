# devsh-memory-mcp

MCP server for devsh/cmux agent memory - enables Claude Desktop, Cursor, and other MCP clients to access sandbox agent memory and orchestrate multi-agent workflows.

## Installation

```bash
npm install -g devsh-memory-mcp
# or
npx devsh-memory-mcp
```

## Usage

### CLI

```bash
# Use default memory directory (/root/lifecycle/memory)
devsh-memory-mcp

# Specify custom directory
devsh-memory-mcp --dir /path/to/memory

# Set agent name for messaging
devsh-memory-mcp --agent my-agent
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "devsh-memory": {
      "command": "npx",
      "args": ["devsh-memory-mcp"]
    }
  }
}
```

With custom options:

```json
{
  "mcpServers": {
    "devsh-memory": {
      "command": "npx",
      "args": ["devsh-memory-mcp", "--dir", "/path/to/memory", "--agent", "claude-desktop"]
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

### Orchestration Tools (Head Agent)

| Tool | Description |
|------|-------------|
| `spawn_agent` | Spawn a sub-agent to work on a task |
| `get_agent_status` | Get status of a spawned agent |
| `list_spawned_agents` | List all agents in current orchestration |
| `wait_for_agent` | Wait for agent to complete (polling) |
| `wait_for_events` | Wait for events via SSE (event-driven, recommended) |
| `cancel_agent` | Cancel a running/pending agent |
| `get_orchestration_summary` | Get dashboard-style orchestration summary |
| `pull_orchestration_updates` | Sync local PLAN.json with server (read) |
| `push_orchestration_updates` | Push task status/completion to server (write) |
| `read_orchestration` | Read PLAN.json, AGENTS.json, or EVENTS.jsonl |
| `append_event` | Append an orchestration event to EVENTS.jsonl |
| `update_plan_task` | Update task status in PLAN.json |

### Provider Session Tools

| Tool | Description |
|------|-------------|
| `bind_provider_session` | Bind a Claude session ID or Codex thread ID to task |
| `get_provider_session` | Get provider session binding for task resume |

### Orchestration Learning Tools

| Tool | Description |
|------|-------------|
| `log_learning` | Log an orchestration learning, error, or feature request to the server |
| `get_active_orchestration_rules` | Fetch active orchestration rules for the team |

**log_learning types:**
- `learning` - Discovered a better orchestration pattern
- `error` - Found an error pattern to avoid
- `feature_request` - Missing capability that would help

Logged items are reviewed by team leads and may be promoted to active orchestration rules.

### Environment Variables (Orchestration)

| Variable | Description |
|----------|-------------|
| `CMUX_TASK_RUN_JWT` | JWT for authenticating orchestration API calls |
| `CMUX_ORCHESTRATION_ID` | Current orchestration session ID |
| `CMUX_API_BASE_URL` | API base URL (default: https://cmux.sh) |

## Memory Directory Structure

```
/root/lifecycle/memory/
├── knowledge/
│   └── MEMORY.md              # Long-term insights (P0/P1/P2 sections)
├── daily/
│   └── {date}.md              # Daily session logs
├── orchestration/
│   ├── PLAN.json              # Orchestration task plan
│   ├── AGENTS.json            # Agent registry
│   └── EVENTS.jsonl           # Orchestration event log
├── behavior/
│   ├── HOT.md                 # Active workflow preferences
│   ├── corrections.jsonl      # User corrections log
│   ├── LEARNINGS.jsonl        # Orchestration learnings
│   ├── ERRORS.jsonl           # Error patterns
│   ├── FEATURE_REQUESTS.jsonl # Feature requests
│   └── skill-candidates.json  # Repeated patterns
├── TASKS.json                 # Task registry
└── MAILBOX.json               # Inter-agent messages
```

## Priority Tiers (MEMORY.md)

- **P0 - Core**: Never expires. Project fundamentals, invariants.
- **P1 - Active**: 90-day TTL. Ongoing work, current strategies.
- **P2 - Reference**: 30-day TTL. Temporary findings, debug notes.

Format: `- [YYYY-MM-DD] Your insight here`

## Development

### Running Tests

```bash
cd packages/devsh-memory-mcp
bun test
```

### Test Coverage

The package includes 81 unit tests covering:

- **JWT Helper** (5 tests): Token extraction, edge cases, UUID handling
- **Orchestration Tools** (24 tests): spawn_agent, get_agent_status, wait_for_agent schemas and URL construction
- **Memory Tools** (27 tests): Task/message structures, file paths, agent name validation
- **Learning Tools** (30 tests): log_learning, get_active_orchestration_rules, error handling

All tests run without external dependencies, suitable for CI environments
