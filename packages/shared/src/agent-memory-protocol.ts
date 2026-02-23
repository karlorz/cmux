/**
 * Agent Memory Protocol - Spike S2b
 *
 * Two-tier memory architecture with priority tiering:
 * - Layer 1 (daily/): Ephemeral daily logs - auto-dated, session-specific
 * - Layer 2 (knowledge/): Curated long-term memory with P0/P1/P2 priority tiers
 *   - P0 Core: Never expires - project fundamentals, safety rules, invariants
 *   - P1 Active: 90-day TTL - ongoing work, current strategies, recent decisions
 *   - P2 Reference: 30-day TTL - debug notes, one-time findings, temporary context
 *
 * Seeds memory directory with:
 * - TASKS.json, MAILBOX.json at root
 * - knowledge/MEMORY.md for permanent insights (P0/P1/P2 sections)
 * - daily/{date}.md for session-specific notes
 *
 * IMPORTANT: Memory is stored at /root/lifecycle/memory/ (OUTSIDE the git workspace)
 * to avoid polluting the user's repository with untracked files. This follows the
 * pattern used by Claude hooks, Codex, and OpenCode which all use /root/lifecycle/.
 */

import type { AuthFile } from "./worker-schemas";

// Memory protocol directory path (absolute, outside git workspace)
// Using /root/lifecycle/ to match existing patterns (Claude hooks, Codex, OpenCode)
// This prevents git pollution - memory files won't appear in `git status`
export const MEMORY_PROTOCOL_DIR = "/root/lifecycle/memory";

// Subdirectories for two-tier memory architecture
export const MEMORY_DAILY_DIR = `${MEMORY_PROTOCOL_DIR}/daily`;
export const MEMORY_KNOWLEDGE_DIR = `${MEMORY_PROTOCOL_DIR}/knowledge`;

// Orchestration subdirectory for multi-agent coordination
export const MEMORY_ORCHESTRATION_DIR = `${MEMORY_PROTOCOL_DIR}/orchestration`;

/**
 * Get today's date string in YYYY-MM-DD format for daily log files.
 */
export function getTodayDateString(): string {
  const iso = new Date().toISOString();
  return iso.slice(0, iso.indexOf("T"));
}

/**
 * Seed content for TASKS.json
 */
export function getTasksSeedContent(sandboxId: string): string {
  const seed = {
    version: 1,
    tasks: [],
    metadata: {
      sandboxId,
      createdAt: new Date().toISOString(),
    },
  };
  return JSON.stringify(seed, null, 2);
}

/**
 * Seed content for knowledge/MEMORY.md (Layer 2 - permanent insights with priority tiers)
 */
export function getKnowledgeSeedContent(): string {
  return `# Project Knowledge

> Curated insights organized by priority. Add date tags for TTL tracking.

## P0 - Core (Never Expires)
<!-- Fundamental project facts, configuration, invariants -->
<!-- Examples: "Uses bun, not npm", "Port 3001 for auth service" -->

## P1 - Active (90-day TTL)
<!-- Ongoing work context, current strategies, recent decisions -->
<!-- Review entries older than 90 days: promote to P0 or remove -->

## P2 - Reference (30-day TTL)
<!-- Temporary findings, debug notes, one-off context -->
<!-- Review entries older than 30 days: promote to P1 or remove -->

---
*Priority guide: P0 = permanent truth, P1 = active context, P2 = temporary reference*
*Format: - [YYYY-MM-DD] Your insight here*
`;
}

/**
 * Seed content for daily/{date}.md (Layer 1 - ephemeral logs)
 * @param date - Date string in YYYY-MM-DD format
 */
export function getDailyLogSeedContent(date: string): string {
  return `# Daily Log: ${date}

> Session-specific observations. Temporary notes go here.

---
`;
}

/**
 * Seed content for MAILBOX.json
 */
export function getMailboxSeedContent(): string {
  const seed = {
    version: 1,
    messages: [],
  };
  return JSON.stringify(seed, null, 2);
}

/**
 * Orchestration task status for PLAN.json
 */
export type OrchestrationTaskStatus =
  | "pending"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Orchestration task in PLAN.json
 */
export interface OrchestrationTask {
  id: string;
  prompt: string;
  agentName: string;
  status: OrchestrationTaskStatus;
  taskRunId?: string;
  dependsOn?: string[];
  priority?: number;
  result?: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Orchestration plan structure for PLAN.json
 */
export interface OrchestrationPlan {
  version: number;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "running" | "completed" | "failed" | "paused";
  headAgent: string;
  orchestrationId: string;
  description?: string;
  tasks: OrchestrationTask[];
  metadata?: Record<string, unknown>;
}

/**
 * Spawned agent record in AGENTS.json
 */
export interface SpawnedAgent {
  taskRunId: string;
  agentName: string;
  status: OrchestrationTaskStatus;
  sandboxId?: string;
  prompt: string;
  spawnedAt: string;
  completedAt?: string;
  result?: string;
  errorMessage?: string;
}

/**
 * Agents registry structure for AGENTS.json
 */
export interface AgentsRegistry {
  version: number;
  orchestrationId: string;
  headAgent: string;
  agents: SpawnedAgent[];
}

/**
 * Orchestration event types for EVENTS.jsonl
 */
export type OrchestrationEventType =
  | "orchestration_started"
  | "orchestration_completed"
  | "orchestration_failed"
  | "orchestration_paused"
  | "orchestration_resumed"
  | "agent_spawned"
  | "agent_started"
  | "agent_completed"
  | "agent_failed"
  | "agent_cancelled"
  | "message_sent"
  | "message_received"
  | "dependency_resolved"
  | "plan_updated";

/**
 * Orchestration event for EVENTS.jsonl
 */
export interface OrchestrationEvent {
  timestamp: string;
  event: OrchestrationEventType;
  taskRunId?: string;
  agentName?: string;
  status?: string;
  message?: string;
  from?: string;
  to?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Generate unique orchestration ID
 */
export function generateOrchestrationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `orch_${timestamp}${random}`;
}

/**
 * Generate unique task ID for orchestration tasks
 */
export function generateOrchestrationTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `task_${timestamp}${random}`;
}

/**
 * Seed content for PLAN.json (orchestration plan)
 */
export function getOrchestrationPlanSeedContent(
  headAgent: string,
  orchestrationId: string,
  description?: string
): string {
  const plan: OrchestrationPlan = {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending",
    headAgent,
    orchestrationId,
    description,
    tasks: [],
  };
  return JSON.stringify(plan, null, 2);
}

/**
 * Seed content for AGENTS.json (spawned agents registry)
 */
export function getAgentsRegistrySeedContent(
  headAgent: string,
  orchestrationId: string
): string {
  const registry: AgentsRegistry = {
    version: 1,
    orchestrationId,
    headAgent,
    agents: [],
  };
  return JSON.stringify(registry, null, 2);
}

/**
 * Format an orchestration event for EVENTS.jsonl
 */
export function formatOrchestrationEvent(
  event: OrchestrationEvent
): string {
  return JSON.stringify(event);
}

/**
 * Memory protocol instructions for agents.
 * This text should be included in each agent's instruction file.
 *
 * @param agentNameEnvVar - The environment variable name for agent name (default: $CMUX_AGENT_NAME)
 */
export function getMemoryProtocolInstructions(
  agentNameEnvVar: string = "$CMUX_AGENT_NAME"
): string {
  return `## cmux Agent Memory Protocol

You have access to persistent memory at \`${MEMORY_PROTOCOL_DIR}/\`:

> Note: Memory is stored outside the git workspace to avoid polluting your repository.

### Memory Structure

- \`${MEMORY_KNOWLEDGE_DIR}/MEMORY.md\` - Long-term insights (curated)
- \`${MEMORY_DAILY_DIR}/{date}.md\` - Daily logs (ephemeral)
- \`${MEMORY_PROTOCOL_DIR}/TASKS.json\` - Task registry
- \`${MEMORY_PROTOCOL_DIR}/MAILBOX.json\` - Inter-agent messages

### On Start
1. Read \`knowledge/MEMORY.md\` for permanent project insights
2. Read \`TASKS.json\` to see existing tasks and their statuses
3. Optionally scan recent \`daily/\` logs for recent context

### During Work
- Append observations to \`daily/{today}.md\` (create if doesn't exist)
- Update task statuses in TASKS.json

### On Completion
- **Daily log**: Append what you did today to \`daily/{today}.md\`
- **Knowledge**: Promote KEY learnings to \`knowledge/MEMORY.md\` (only permanent insights)
- Update TASKS.json with final statuses

### What Goes Where?

| Type | Location | Priority | Example |
|------|----------|----------|---------|
| Project fundamentals | \`knowledge/MEMORY.md\` | P0 | "This project uses bun, not npm" |
| Current work context | \`knowledge/MEMORY.md\` | P1 | "Auth refactor in progress" |
| Temporary findings | \`knowledge/MEMORY.md\` | P2 | "Sandbox morphvm_abc for testing" |
| Today's work | \`daily/{date}.md\` | - | "Fixed bug in auth.ts line 42" |
| Debug notes | \`daily/{date}.md\` | - | "Tested endpoint with curl" |

### Priority Guidelines

- **Date-tag format**: \`- [YYYY-MM-DD] Your insight here\`
- **P0 Core**: Rare, highly stable truths. Never expires. Examples: tooling choices, critical ports, invariants.
- **P1 Active**: Current focus areas. Review after 90 days - promote to P0 if still relevant, or remove.
- **P2 Reference**: One-off findings. Review after 30 days - promote to P1 if still useful, or remove.
- **Daily logs**: Raw session notes. Do not promote everything - only curate what's worth keeping.

### Inter-Agent Messaging (S10 Coordination)

Your agent name: **${agentNameEnvVar}**

You can coordinate with other agents on the same task using the mailbox MCP tools:

| Tool | Description |
|------|-------------|
| \`send_message(to, message, type)\` | Send a message to another agent (or "*" for broadcast) |
| \`get_my_messages()\` | Get messages addressed to you |
| \`mark_read(messageId)\` | Mark a message as read |

#### Message Types
- **handoff**: Transfer work to another agent ("I've completed X, please continue with Y")
- **request**: Ask another agent to do something specific ("Can you review this file?")
- **status**: Broadcast progress updates to all agents ("Starting work on auth module")

#### Coordination Patterns

1. **Handoff Pattern**: When you complete a piece of work that another agent should continue:
   \`\`\`
   send_message("codex/gpt-5.1-codex", "I've implemented the API endpoints. Please write tests for them.", "handoff")
   \`\`\`

2. **Request Pattern**: When you need help from a specific agent:
   \`\`\`
   send_message("claude/opus-4.5", "Can you review the auth flow in src/auth.ts?", "request")
   \`\`\`

3. **Status Broadcast**: Keep all agents informed of progress:
   \`\`\`
   send_message("*", "Completed database migrations, moving to API layer", "status")
   \`\`\`

#### On Start
Check for messages from previous agents:
\`\`\`
get_my_messages()  // See if any agent has left instructions for you
\`\`\`

Messages from previous runs are automatically seeded into your mailbox.
`;
}

/**
 * Get the startup command to create the memory directory structure.
 * Creates daily/, knowledge/, and orchestration/ subdirectories.
 */
export function getMemoryStartupCommand(): string {
  return `mkdir -p ${MEMORY_DAILY_DIR} ${MEMORY_KNOWLEDGE_DIR} ${MEMORY_ORCHESTRATION_DIR}`;
}

/**
 * Generate the memory sync bash script that reads memory files and POSTs them to Convex.
 * This script is called by provider stop hooks before crown/complete.
 *
 * Features:
 * - Best-effort sync (|| true for all commands)
 * - Client-side truncation with head -c 500000
 * - Uses jq for safe JSON construction
 * - Logs to /root/lifecycle/memory-sync.log
 */
export function getMemorySyncScript(): string {
  return `#!/bin/bash
# Memory sync script - syncs agent memory files to Convex
# Called by stop hooks before crown/complete

set -euo pipefail

LOG_FILE="/root/lifecycle/memory-sync.log"
MEMORY_DIR="${MEMORY_PROTOCOL_DIR}"
MAX_SIZE=500000

log() {
  echo "[$(date -Iseconds)] $*" >> "$LOG_FILE"
}

# Best-effort wrapper - never fail the stop hook
sync_memory() {
  log "Starting memory sync"

  # Check required env vars
  if [ -z "\${CMUX_CALLBACK_URL:-}" ] || [ -z "\${CMUX_TASK_RUN_JWT:-}" ]; then
    log "Missing required env vars (CMUX_CALLBACK_URL or CMUX_TASK_RUN_JWT), skipping sync"
    return 0
  fi

  # Check if jq is available
  if ! command -v jq >/dev/null 2>&1; then
    log "jq not found, skipping sync"
    return 0
  fi

  # Build JSON array of files
  files_json="[]"

  # Sync knowledge/MEMORY.md
  if [ -f "$MEMORY_DIR/knowledge/MEMORY.md" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/knowledge/MEMORY.md" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "knowledge", "content": ($c), "fileName": "knowledge/MEMORY.md"}]')
    log "Added knowledge/MEMORY.md"
  fi

  # Sync daily logs (find all .md files in daily/)
  if [ -d "$MEMORY_DIR/daily" ]; then
    for daily_file in "$MEMORY_DIR/daily"/*.md; do
      if [ -f "$daily_file" ]; then
        filename=$(basename "$daily_file")
        date_str="\${filename%.md}"
        content=$(head -c $MAX_SIZE "$daily_file" | jq -Rs .)
        files_json=$(echo "$files_json" | jq --argjson c "$content" --arg d "$date_str" --arg f "daily/$filename" '. + [{"memoryType": "daily", "content": ($c), "fileName": ($f), "date": ($d)}]')
        log "Added daily/$filename"
      fi
    done
  fi

  # Sync TASKS.json
  if [ -f "$MEMORY_DIR/TASKS.json" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/TASKS.json" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "tasks", "content": ($c), "fileName": "TASKS.json"}]')
    log "Added TASKS.json"
  fi

  # Sync MAILBOX.json
  if [ -f "$MEMORY_DIR/MAILBOX.json" ]; then
    content=$(head -c $MAX_SIZE "$MEMORY_DIR/MAILBOX.json" | jq -Rs .)
    files_json=$(echo "$files_json" | jq --argjson c "$content" '. + [{"memoryType": "mailbox", "content": ($c), "fileName": "MAILBOX.json"}]')
    log "Added MAILBOX.json"
  fi

  # Check if we have any files to sync
  file_count=$(echo "$files_json" | jq 'length')
  if [ "$file_count" -eq 0 ]; then
    log "No memory files found to sync"
    return 0
  fi

  # Build final payload
  payload=$(jq -n --argjson files "$files_json" '{"files": $files}')
  log "Syncing $file_count files to Convex"

  # POST to Convex
  response=$(curl -s -w "\\n%{http_code}" -X POST "\${CMUX_CALLBACK_URL}/api/memory/sync" \\
    -H "Content-Type: application/json" \\
    -H "x-cmux-token: \${CMUX_TASK_RUN_JWT}" \\
    -d "$payload" 2>>"$LOG_FILE")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    log "Memory sync successful: $body"
  else
    log "Memory sync failed with HTTP $http_code: $body"
  fi
}

# Run sync with best-effort error handling
sync_memory 2>>"$LOG_FILE" || {
  echo "[$(date -Iseconds)] Memory sync failed but continuing" >> "$LOG_FILE"
}

exit 0
`;
}

/**
 * Get the AuthFile for the memory sync script.
 * This is deployed to /root/lifecycle/memory/sync.sh with execute permissions.
 */
export function getMemorySyncScriptFile(): AuthFile {
  const Buffer = globalThis.Buffer;
  return {
    destinationPath: `${MEMORY_PROTOCOL_DIR}/sync.sh`,
    contentBase64: Buffer.from(getMemorySyncScript()).toString("base64"),
    mode: "755",
  };
}

/**
 * Generate the MCP server script that exposes memory files as tools.
 * This runs as a stdio-based MCP server that Claude can query programmatically.
 *
 * Tools provided:
 * - read_memory(type): Read memory file content (knowledge, tasks, mailbox)
 * - list_daily_logs(): List available daily log dates
 * - read_daily_log(date): Read a specific daily log
 * - search_memory(query): Search across all memory files
 * - send_message(to, message, type): Send a message to another agent
 * - get_my_messages(): Get messages addressed to this agent
 * - mark_read(messageId): Mark a message as read
 */
export function getMemoryMcpServerScript(): string {
  return `#!/usr/bin/env node
/**
 * cmux Memory MCP Server
 * Exposes agent memory files as MCP tools for programmatic access.
 * Uses stdio transport for simplicity in sandbox environments.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const MEMORY_DIR = '${MEMORY_PROTOCOL_DIR}';
const KNOWLEDGE_DIR = path.join(MEMORY_DIR, 'knowledge');
const DAILY_DIR = path.join(MEMORY_DIR, 'daily');
const MAILBOX_PATH = path.join(MEMORY_DIR, 'MAILBOX.json');

// Get agent name from environment (set by cmux)
const AGENT_NAME = process.env.CMUX_AGENT_NAME || 'unknown';

// Simple JSON-RPC over stdio implementation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function sendResponse(id, result, error) {
  const response = {
    jsonrpc: '2.0',
    id
  };
  if (error) {
    response.error = { code: -32000, message: error };
  } else {
    response.result = result;
  }
  console.log(JSON.stringify(response));
}

function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return null;
  }
}

function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    return false;
  }
}

function readMailbox() {
  const content = readFile(MAILBOX_PATH);
  if (!content) {
    return { version: 1, messages: [] };
  }
  try {
    return JSON.parse(content);
  } catch (err) {
    return { version: 1, messages: [] };
  }
}

function writeMailbox(mailbox) {
  return writeFile(MAILBOX_PATH, JSON.stringify(mailbox, null, 2));
}

function generateMessageId() {
  return 'msg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function listDailyLogs() {
  try {
    if (!fs.existsSync(DAILY_DIR)) {
      return [];
    }
    const files = fs.readdirSync(DAILY_DIR);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse();
  } catch (err) {
    return [];
  }
}

function searchMemory(query) {
  const results = [];
  const lowerQuery = query.toLowerCase();

  // Search knowledge
  const knowledge = readFile(path.join(KNOWLEDGE_DIR, 'MEMORY.md'));
  if (knowledge && knowledge.toLowerCase().includes(lowerQuery)) {
    const lines = knowledge.split('\\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(lowerQuery)) {
        results.push({
          source: 'knowledge/MEMORY.md',
          line: i + 1,
          content: lines[i].trim()
        });
      }
    }
  }

  // Search tasks
  const tasks = readFile(path.join(MEMORY_DIR, 'TASKS.json'));
  if (tasks && tasks.toLowerCase().includes(lowerQuery)) {
    results.push({
      source: 'TASKS.json',
      content: 'Match found in tasks file'
    });
  }

  // Search mailbox
  const mailbox = readFile(path.join(MEMORY_DIR, 'MAILBOX.json'));
  if (mailbox && mailbox.toLowerCase().includes(lowerQuery)) {
    results.push({
      source: 'MAILBOX.json',
      content: 'Match found in mailbox file'
    });
  }

  // Search daily logs
  const dailyLogs = listDailyLogs();
  for (const date of dailyLogs.slice(0, 7)) { // Only search last 7 days
    const logContent = readFile(path.join(DAILY_DIR, date + '.md'));
    if (logContent && logContent.toLowerCase().includes(lowerQuery)) {
      const lines = logContent.split('\\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          results.push({
            source: 'daily/' + date + '.md',
            line: i + 1,
            content: lines[i].trim()
          });
        }
      }
    }
  }

  return results;
}

// MCP protocol handlers
const tools = [
  {
    name: 'read_memory',
    description: 'Read a memory file. Type can be "knowledge", "tasks", or "mailbox".',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['knowledge', 'tasks', 'mailbox'],
          description: 'The type of memory to read'
        }
      },
      required: ['type']
    }
  },
  {
    name: 'list_daily_logs',
    description: 'List available daily log dates (newest first).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'read_daily_log',
    description: 'Read a specific daily log by date (YYYY-MM-DD format).',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'The date in YYYY-MM-DD format'
        }
      },
      required: ['date']
    }
  },
  {
    name: 'search_memory',
    description: 'Search across all memory files for a query string.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'send_message',
    description: 'Send a message to another agent on the same task. Use "*" to broadcast to all agents.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient agent name (e.g., "claude/opus-4.5") or "*" for broadcast'
        },
        message: {
          type: 'string',
          description: 'The message content'
        },
        type: {
          type: 'string',
          enum: ['handoff', 'request', 'status'],
          description: 'Message type: handoff (work transfer), request (ask to do something), status (progress update)'
        }
      },
      required: ['to', 'message']
    }
  },
  {
    name: 'get_my_messages',
    description: 'Get all messages addressed to this agent (including broadcasts). Returns unread messages first.',
    inputSchema: {
      type: 'object',
      properties: {
        includeRead: {
          type: 'boolean',
          description: 'Include messages already marked as read (default: false)'
        }
      }
    }
  },
  {
    name: 'mark_read',
    description: 'Mark a message as read by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'The message ID to mark as read'
        }
      },
      required: ['messageId']
    }
  }
];

function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      return sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'cmux-memory', version: '1.0.0' }
      });

    case 'tools/list':
      return sendResponse(id, { tools });

    case 'tools/call':
      const { name, arguments: args } = params;

      switch (name) {
        case 'read_memory': {
          const typeToPath = {
            knowledge: path.join(KNOWLEDGE_DIR, 'MEMORY.md'),
            tasks: path.join(MEMORY_DIR, 'TASKS.json'),
            mailbox: path.join(MEMORY_DIR, 'MAILBOX.json')
          };
          const content = readFile(typeToPath[args.type]);
          if (content === null) {
            return sendResponse(id, { content: [{ type: 'text', text: 'File not found or empty.' }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: content }] });
        }

        case 'list_daily_logs': {
          const dates = listDailyLogs();
          return sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(dates, null, 2) }] });
        }

        case 'read_daily_log': {
          const content = readFile(path.join(DAILY_DIR, args.date + '.md'));
          if (content === null) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Daily log not found for date: ' + args.date }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: content }] });
        }

        case 'search_memory': {
          const results = searchMemory(args.query);
          if (results.length === 0) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No matches found for: ' + args.query }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] });
        }

        case 'send_message': {
          const mailbox = readMailbox();
          const newMessage = {
            id: generateMessageId(),
            from: AGENT_NAME,
            to: args.to,
            type: args.type || 'status',
            message: args.message,
            timestamp: new Date().toISOString(),
            read: false
          };
          mailbox.messages.push(newMessage);
          if (writeMailbox(mailbox)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Message sent successfully. ID: ' + newMessage.id }] });
          } else {
            return sendResponse(id, null, 'Failed to write mailbox');
          }
        }

        case 'get_my_messages': {
          const mailbox = readMailbox();
          const includeRead = args.includeRead || false;
          const myMessages = mailbox.messages.filter(msg => {
            const isForMe = msg.to === AGENT_NAME || msg.to === '*';
            const isFromMe = msg.from === AGENT_NAME;
            const shouldInclude = includeRead || !msg.read;
            return isForMe && !isFromMe && shouldInclude;
          });
          // Sort: unread first, then by timestamp
          myMessages.sort((a, b) => {
            if (a.read !== b.read) return a.read ? 1 : -1;
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          });
          if (myMessages.length === 0) {
            return sendResponse(id, { content: [{ type: 'text', text: 'No messages for you.' }] });
          }
          return sendResponse(id, { content: [{ type: 'text', text: JSON.stringify(myMessages, null, 2) }] });
        }

        case 'mark_read': {
          const mailbox = readMailbox();
          const msgIndex = mailbox.messages.findIndex(msg => msg.id === args.messageId);
          if (msgIndex === -1) {
            return sendResponse(id, null, 'Message not found: ' + args.messageId);
          }
          mailbox.messages[msgIndex].read = true;
          if (writeMailbox(mailbox)) {
            return sendResponse(id, { content: [{ type: 'text', text: 'Message marked as read.' }] });
          } else {
            return sendResponse(id, null, 'Failed to update mailbox');
          }
        }

        default:
          return sendResponse(id, null, 'Unknown tool: ' + name);
      }

    default:
      return sendResponse(id, null, 'Unknown method: ' + method);
  }
}

// Read JSON-RPC messages line by line
rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    handleRequest(request);
  } catch (err) {
    // Ignore parse errors
  }
});

// Send initialized notification
process.stderr.write('[cmux-memory] MCP server started\\n');
`;
}

/**
 * Get the AuthFile for the MCP server script.
 * This is deployed to /root/lifecycle/memory/mcp-server.js with execute permissions.
 */
export function getMemoryMcpServerFile(): AuthFile {
  const Buffer = globalThis.Buffer;
  return {
    destinationPath: `${MEMORY_PROTOCOL_DIR}/mcp-server.js`,
    contentBase64: Buffer.from(getMemoryMcpServerScript()).toString("base64"),
    mode: "755",
  };
}

/**
 * Orchestration seed options for multi-agent coordination
 */
export interface OrchestrationSeedOptions {
  headAgent: string;
  orchestrationId?: string;
  description?: string;
  previousPlan?: string;
  previousAgents?: string;
}

/**
 * Get auth files for orchestration memory content.
 * These files are written to the orchestration/ subdirectory.
 *
 * @param options - Orchestration seed options
 */
export function getOrchestrationSeedFiles(
  options: OrchestrationSeedOptions
): AuthFile[] {
  const Buffer = globalThis.Buffer;
  const orchestrationId = options.orchestrationId ?? generateOrchestrationId();

  // Use previous plan if provided, otherwise create new
  const planContent =
    options.previousPlan && options.previousPlan.trim().length > 0
      ? options.previousPlan
      : getOrchestrationPlanSeedContent(
          options.headAgent,
          orchestrationId,
          options.description
        );

  // Use previous agents registry if provided, otherwise create new
  const agentsContent =
    options.previousAgents && options.previousAgents.trim().length > 0
      ? options.previousAgents
      : getAgentsRegistrySeedContent(options.headAgent, orchestrationId);

  return [
    {
      destinationPath: `${MEMORY_ORCHESTRATION_DIR}/PLAN.json`,
      contentBase64: Buffer.from(planContent).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_ORCHESTRATION_DIR}/AGENTS.json`,
      contentBase64: Buffer.from(agentsContent).toString("base64"),
      mode: "644",
    },
    // EVENTS.jsonl is created empty - events are appended during execution
    {
      destinationPath: `${MEMORY_ORCHESTRATION_DIR}/EVENTS.jsonl`,
      contentBase64: Buffer.from("").toString("base64"),
      mode: "644",
    },
  ];
}

/**
 * Get auth files for memory protocol seed content.
 * These files are written to the sandbox at startup.
 * Files are placed at /root/lifecycle/memory/ (outside git workspace).
 *
 * Two-tier structure:
 * - TASKS.json, MAILBOX.json at root
 * - knowledge/MEMORY.md for permanent insights
 * - daily/{date}.md for session-specific notes
 * - sync.sh for memory sync to Convex
 *
 * @param sandboxId - The sandbox/task run ID for metadata
 * @param previousKnowledge - Optional previous knowledge content from earlier runs (for cross-run seeding)
 * @param previousMailbox - Optional previous mailbox content with unread messages (for cross-run seeding)
 * @param orchestrationOptions - Optional orchestration seed options for multi-agent mode
 */
export function getMemorySeedFiles(
  sandboxId: string,
  previousKnowledge?: string,
  previousMailbox?: string,
  orchestrationOptions?: OrchestrationSeedOptions
): AuthFile[] {
  const Buffer = globalThis.Buffer;
  const today = getTodayDateString();

  // Use previous knowledge if provided and non-empty, otherwise use default template
  const knowledgeContent =
    previousKnowledge && previousKnowledge.trim().length > 0
      ? previousKnowledge
      : getKnowledgeSeedContent();

  // Use previous mailbox if provided (with unread messages), otherwise empty mailbox
  const mailboxContent =
    previousMailbox && previousMailbox.trim().length > 0
      ? previousMailbox
      : getMailboxSeedContent();

  const files: AuthFile[] = [
    {
      destinationPath: `${MEMORY_PROTOCOL_DIR}/TASKS.json`,
      contentBase64: Buffer.from(getTasksSeedContent(sandboxId)).toString(
        "base64"
      ),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_KNOWLEDGE_DIR}/MEMORY.md`,
      contentBase64: Buffer.from(knowledgeContent).toString("base64"),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_DAILY_DIR}/${today}.md`,
      contentBase64: Buffer.from(getDailyLogSeedContent(today)).toString(
        "base64"
      ),
      mode: "644",
    },
    {
      destinationPath: `${MEMORY_PROTOCOL_DIR}/MAILBOX.json`,
      contentBase64: Buffer.from(mailboxContent).toString("base64"),
      mode: "644",
    },
    // Include sync script for memory sync to Convex
    getMemorySyncScriptFile(),
    // Include MCP server for programmatic memory access (S6)
    getMemoryMcpServerFile(),
  ];

  // Add orchestration files if options provided
  if (orchestrationOptions) {
    files.push(...getOrchestrationSeedFiles(orchestrationOptions));
  }

  return files;
}
