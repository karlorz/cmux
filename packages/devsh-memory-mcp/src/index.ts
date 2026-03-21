/**
 * cmux Memory MCP Server
 *
 * Standalone MCP server that exposes cmux agent memory for external clients
 * like Claude Desktop and Cursor. Can connect to:
 * - Local sandbox memory directory
 * - Remote sandbox via SSH/HTTP
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Extract teamId from a CMUX JWT token.
 * Returns null if the token is invalid or doesn't contain a teamId.
 */
function extractTeamIdFromJwt(jwt: string): string | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;

    let payload = parts[1];
    // Add base64 padding if needed
    const paddingNeeded = (4 - (payload.length % 4)) % 4;
    payload = payload + "=".repeat(paddingNeeded);

    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const data = JSON.parse(decoded) as { teamId?: string };
    return data.teamId ?? null;
  } catch {
    return null;
  }
}

export interface MemoryMcpConfig {
  memoryDir: string;
  agentName?: string;
}

const DEFAULT_MEMORY_DIR = "/root/lifecycle/memory";

export function createMemoryMcpServer(config?: Partial<MemoryMcpConfig>) {
  const memoryDir = config?.memoryDir ?? DEFAULT_MEMORY_DIR;
  const resolvedAgentName = config?.agentName ?? process.env.CMUX_AGENT_NAME;
  const agentName = resolvedAgentName ?? "external-client";

  if (!resolvedAgentName) {
    console.error(
      '[devsh-memory-mcp] Warning: no agent identity provided; falling back to "external-client". ' +
        "Pass --agent <name> or set CMUX_AGENT_NAME to preserve mailbox sender identity."
    );
  }

  const knowledgeDir = path.join(memoryDir, "knowledge");
  const dailyDir = path.join(memoryDir, "daily");
  const orchestrationDir = path.join(memoryDir, "orchestration");
  const mailboxPath = path.join(memoryDir, "MAILBOX.json");
  const tasksPath = path.join(memoryDir, "TASKS.json");
  const usageStatsPath = path.join(memoryDir, "USAGE_STATS.json");
  const planPath = path.join(orchestrationDir, "PLAN.json");
  const agentsPath = path.join(orchestrationDir, "AGENTS.json");
  const eventsPath = path.join(orchestrationDir, "EVENTS.jsonl");

  // Usage tracking for memory freshness (Q4 Phase 3)
  interface UsageStats {
    version: number;
    entries: Record<string, {
      readCount: number;
      lastRead: string;
      lastWrite?: string;
      createdAt: string;
    }>;
  }

  function readUsageStats(): UsageStats {
    const content = readFile(usageStatsPath);
    if (!content) return { version: 1, entries: {} };
    try {
      return JSON.parse(content) as UsageStats;
    } catch {
      return { version: 1, entries: {} };
    }
  }

  function writeUsageStats(stats: UsageStats): boolean {
    return writeFile(usageStatsPath, JSON.stringify(stats, null, 2));
  }

  function trackRead(memoryType: string): void {
    const stats = readUsageStats();
    const now = new Date().toISOString();
    if (!stats.entries[memoryType]) {
      stats.entries[memoryType] = {
        readCount: 0,
        lastRead: now,
        createdAt: now,
      };
    }
    stats.entries[memoryType].readCount++;
    stats.entries[memoryType].lastRead = now;
    writeUsageStats(stats);
  }

  function trackWrite(memoryType: string): void {
    const stats = readUsageStats();
    const now = new Date().toISOString();
    if (!stats.entries[memoryType]) {
      stats.entries[memoryType] = {
        readCount: 0,
        lastRead: now,
        createdAt: now,
      };
    }
    stats.entries[memoryType].lastWrite = now;
    writeUsageStats(stats);
  }

  // Helper functions
  function readFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  function writeFile(filePath: string, content: string): boolean {
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  interface Mailbox {
    version: number;
    messages: MailboxMessage[];
  }

  interface MailboxMessage {
    id: string;
    from: string;
    to: string;
    type?: "handoff" | "request" | "status" | "response";
    message: string;
    timestamp: string;
    read?: boolean;
    // SendMessage alignment fields
    correlationId?: string; // For request-response tracking
    replyTo?: string; // Message ID this is responding to
    metadata?: Record<string, unknown>; // Additional context
    priority?: "high" | "normal" | "low"; // Message urgency
  }

  interface TaskEntry {
    id: string;
    subject: string;
    description: string;
    status: "pending" | "in_progress" | "completed";
    createdAt: string;
    updatedAt: string;
  }

  interface TasksFile {
    version: number;
    tasks: TaskEntry[];
    metadata?: {
      sandboxId?: string;
      createdAt?: string;
    };
  }

  function readTasks(): TasksFile {
    const content = readFile(tasksPath);
    if (!content) return { version: 1, tasks: [] };
    try {
      return JSON.parse(content) as TasksFile;
    } catch {
      return { version: 1, tasks: [] };
    }
  }

  function writeTasks(tasks: TasksFile): boolean {
    return writeFile(tasksPath, JSON.stringify(tasks, null, 2));
  }

  function generateTaskId(): string {
    return "task_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }

  function getTodayDateString(): string {
    const iso = new Date().toISOString();
    return iso.slice(0, iso.indexOf("T"));
  }

  function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  // Orchestration types and helpers
  interface OrchestrationTask {
    id: string;
    prompt: string;
    agentName: string;
    status: string;
    taskRunId?: string;
    dependsOn?: string[];
    priority?: number;
    result?: string;
    errorMessage?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  }

  interface OrchestrationPlan {
    version: number;
    createdAt: string;
    updatedAt: string;
    status: string;
    headAgent: string;
    orchestrationId: string;
    description?: string;
    tasks: OrchestrationTask[];
    metadata?: Record<string, unknown>;
  }

  interface OrchestrationEvent {
    timestamp: string;
    event: string;
    taskRunId?: string;
    agentName?: string;
    status?: string;
    message?: string;
    from?: string;
    to?: string;
    type?: string;
    metadata?: Record<string, unknown>;
  }

  function readPlan(): OrchestrationPlan | null {
    const content = readFile(planPath);
    if (!content) return null;
    try {
      return JSON.parse(content) as OrchestrationPlan;
    } catch {
      return null;
    }
  }

  function writePlan(plan: OrchestrationPlan): boolean {
    ensureDir(orchestrationDir);
    plan.updatedAt = new Date().toISOString();
    return writeFile(planPath, JSON.stringify(plan, null, 2));
  }

  function appendEvent(event: OrchestrationEvent): boolean {
    ensureDir(orchestrationDir);
    const line = JSON.stringify(event) + "\n";
    try {
      fs.appendFileSync(eventsPath, line, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  function readMailbox(): Mailbox {
    const content = readFile(mailboxPath);
    if (!content) return { version: 1, messages: [] };
    try {
      return JSON.parse(content) as Mailbox;
    } catch {
      return { version: 1, messages: [] };
    }
  }

  function writeMailbox(mailbox: Mailbox): boolean {
    return writeFile(mailboxPath, JSON.stringify(mailbox, null, 2));
  }

  function generateMessageId(): string {
    return "msg_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }

  function listDailyLogs(): string[] {
    try {
      if (!fs.existsSync(dailyDir)) return [];
      const files = fs.readdirSync(dailyDir);
      return files
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(".md", ""))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  interface SearchResult {
    source: string;
    line?: number;
    content: string;
  }

  function searchMemory(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    // Search knowledge
    const knowledge = readFile(path.join(knowledgeDir, "MEMORY.md"));
    if (knowledge?.toLowerCase().includes(lowerQuery)) {
      const lines = knowledge.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          results.push({
            source: "knowledge/MEMORY.md",
            line: i + 1,
            content: lines[i].trim(),
          });
        }
      }
    }

    // Search tasks
    const tasks = readFile(tasksPath);
    if (tasks?.toLowerCase().includes(lowerQuery)) {
      results.push({ source: "TASKS.json", content: "Match found in tasks file" });
    }

    // Search mailbox
    const mailbox = readFile(mailboxPath);
    if (mailbox?.toLowerCase().includes(lowerQuery)) {
      results.push({ source: "MAILBOX.json", content: "Match found in mailbox file" });
    }

    // Search daily logs (last 7 days)
    const dailyLogs = listDailyLogs();
    for (const date of dailyLogs.slice(0, 7)) {
      const logContent = readFile(path.join(dailyDir, `${date}.md`));
      if (logContent?.toLowerCase().includes(lowerQuery)) {
        const lines = logContent.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            results.push({
              source: `daily/${date}.md`,
              line: i + 1,
              content: lines[i].trim(),
            });
          }
        }
      }
    }

    return results;
  }

  // Create MCP server
  const server = new Server(
    {
      name: "devsh-memory",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "read_memory",
        description: 'Read a memory file. Type can be "knowledge", "tasks", or "mailbox". For tasks, by default only returns open tasks (pending/in_progress) to prevent context bloat.',
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              enum: ["knowledge", "tasks", "mailbox"],
              description: "The type of memory to read",
            },
            includeCompleted: {
              type: "boolean",
              description: "For tasks: include completed tasks (default: false, only open tasks)",
            },
            limit: {
              type: "number",
              description: "For tasks: maximum number of tasks to return (default: 50)",
            },
          },
          required: ["type"],
        },
      },
      {
        name: "list_daily_logs",
        description: "List available daily log dates (newest first).",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "read_daily_log",
        description: "Read a specific daily log by date (YYYY-MM-DD format).",
        inputSchema: {
          type: "object" as const,
          properties: {
            date: {
              type: "string",
              description: "The date in YYYY-MM-DD format",
            },
          },
          required: ["date"],
        },
      },
      {
        name: "search_memory",
        description: "Search across all memory files for a query string.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_memory_usage",
        description: "Get usage statistics for memory files. Shows read/write counts and timestamps for freshness tracking.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "send_message",
        description: 'Send a message to another agent on the same task. Use "*" to broadcast to all agents. Aligned with Claude Code SendMessage pattern.',
        inputSchema: {
          type: "object" as const,
          properties: {
            to: {
              type: "string",
              description: 'Recipient agent name (e.g., "claude/opus-4.5") or "*" for broadcast',
            },
            message: {
              type: "string",
              description: "The message content",
            },
            type: {
              type: "string",
              enum: ["handoff", "request", "status", "response"],
              description: "Message type: handoff (work transfer), request (ask to do something), status (progress update), response (reply to a request)",
            },
            correlationId: {
              type: "string",
              description: "Optional correlation ID for request-response tracking. Use to link related messages.",
            },
            replyTo: {
              type: "string",
              description: "Optional message ID this is responding to (for response type messages).",
            },
            priority: {
              type: "string",
              enum: ["high", "normal", "low"],
              description: "Message priority (default: normal). High priority messages appear first.",
            },
            metadata: {
              type: "object",
              description: "Optional additional context as key-value pairs.",
            },
          },
          required: ["to", "message"],
        },
      },
      {
        name: "get_my_messages",
        description: "Get all messages addressed to this agent (including broadcasts). Returns high-priority and unread messages first.",
        inputSchema: {
          type: "object" as const,
          properties: {
            includeRead: {
              type: "boolean",
              description: "Include messages already marked as read (default: false)",
            },
            correlationId: {
              type: "string",
              description: "Filter messages by correlation ID (for tracking request-response chains)",
            },
            type: {
              type: "string",
              enum: ["handoff", "request", "status", "response"],
              description: "Filter messages by type",
            },
          },
        },
      },
      {
        name: "mark_read",
        description: "Mark a message as read by its ID.",
        inputSchema: {
          type: "object" as const,
          properties: {
            messageId: {
              type: "string",
              description: "The message ID to mark as read",
            },
          },
          required: ["messageId"],
        },
      },
      // Write tools
      {
        name: "append_daily_log",
        description: "Append content to today's daily log. Creates the file if it doesn't exist.",
        inputSchema: {
          type: "object" as const,
          properties: {
            content: {
              type: "string",
              description: "Content to append to the daily log",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "update_knowledge",
        description: "Update a specific priority section in the knowledge file (MEMORY.md). Appends a new entry with today's date.",
        inputSchema: {
          type: "object" as const,
          properties: {
            section: {
              type: "string",
              enum: ["P0", "P1", "P2"],
              description: "Priority section to update (P0=Core, P1=Active, P2=Reference)",
            },
            content: {
              type: "string",
              description: "Content to add to the section (will be prefixed with today's date)",
            },
          },
          required: ["section", "content"],
        },
      },
      {
        name: "add_task",
        description: "Add a new task to the TASKS.json file.",
        inputSchema: {
          type: "object" as const,
          properties: {
            subject: {
              type: "string",
              description: "Brief title for the task",
            },
            description: {
              type: "string",
              description: "Detailed description of what needs to be done",
            },
          },
          required: ["subject", "description"],
        },
      },
      {
        name: "update_task",
        description: "Update the status of an existing task in TASKS.json.",
        inputSchema: {
          type: "object" as const,
          properties: {
            taskId: {
              type: "string",
              description: "The ID of the task to update",
            },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
              description: "New status for the task",
            },
          },
          required: ["taskId", "status"],
        },
      },
      // Orchestration tools
      {
        name: "read_orchestration",
        description: "Read an orchestration file (PLAN.json, AGENTS.json, or EVENTS.jsonl).",
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              enum: ["plan", "agents", "events"],
              description: "Type of orchestration file to read",
            },
          },
          required: ["type"],
        },
      },
      {
        name: "append_event",
        description: "Append an orchestration event to EVENTS.jsonl.",
        inputSchema: {
          type: "object" as const,
          properties: {
            event: {
              type: "string",
              description: "Event type (e.g., agent_spawned, agent_completed, message_sent)",
            },
            message: {
              type: "string",
              description: "Human-readable message describing the event",
            },
            agentName: {
              type: "string",
              description: "Agent name associated with the event (optional)",
            },
            taskRunId: {
              type: "string",
              description: "Task run ID associated with the event (optional)",
            },
          },
          required: ["event", "message"],
        },
      },
      {
        name: "update_plan_task",
        description: "Update the status of a task in the orchestration PLAN.json.",
        inputSchema: {
          type: "object" as const,
          properties: {
            taskId: {
              type: "string",
              description: "The ID of the orchestration task to update",
            },
            status: {
              type: "string",
              description: "New status (pending, assigned, running, completed, failed, cancelled)",
            },
            result: {
              type: "string",
              description: "Result message (for completed tasks)",
            },
            errorMessage: {
              type: "string",
              description: "Error message (for failed tasks)",
            },
          },
          required: ["taskId", "status"],
        },
      },
      {
        name: "pull_orchestration_updates",
        description: "Sync local orchestration state (PLAN.json) with the server. Fetches latest task statuses, messages, and aggregated progress. Requires CMUX_TASK_RUN_JWT environment variable.",
        inputSchema: {
          type: "object" as const,
          properties: {
            orchestrationId: {
              type: "string",
              description: "The orchestration ID to sync. Uses CMUX_ORCHESTRATION_ID env var if not provided.",
            },
          },
        },
      },
      {
        name: "push_orchestration_updates",
        description: "Push local orchestration state to the server. Reports task completion/failure and head agent status. Used for heartbeats and signaling orchestration completion. Requires CMUX_TASK_RUN_JWT environment variable.",
        inputSchema: {
          type: "object" as const,
          properties: {
            orchestrationId: {
              type: "string",
              description: "The orchestration ID to push updates for. Uses CMUX_ORCHESTRATION_ID env var if not provided.",
            },
            headAgentStatus: {
              type: "string",
              enum: ["running", "completed", "failed"],
              description: "Head agent's overall status (optional, for heartbeat/completion signal)",
            },
            message: {
              type: "string",
              description: "Optional status message from head agent",
            },
            taskIds: {
              type: "array",
              items: { type: "string" },
              description: "Optional list of local task IDs to push (default: all completed/failed tasks)",
            },
          },
        },
      },
      {
        name: "spawn_agent",
        description: "Spawn a sub-agent to work on a task. Requires CMUX_TASK_RUN_JWT for authentication. The sub-agent runs in a new sandbox and works on the specified prompt.",
        inputSchema: {
          type: "object" as const,
          properties: {
            prompt: {
              type: "string",
              description: "The task prompt for the sub-agent",
            },
            agentName: {
              type: "string",
              description: "Agent to use (e.g., 'claude/haiku-4.5', 'codex/gpt-5.1-codex-mini')",
            },
            repo: {
              type: "string",
              description: "GitHub repository in owner/repo format (optional)",
            },
            branch: {
              type: "string",
              description: "Base branch to checkout (optional, defaults to main)",
            },
            dependsOn: {
              type: "array",
              items: { type: "string" },
              description: "Array of orchestration task IDs this task depends on (optional)",
            },
            priority: {
              type: "number",
              description: "Task priority (0=highest, 10=lowest, default 5)",
            },
          },
          required: ["prompt", "agentName"],
        },
      },
      {
        name: "get_agent_status",
        description: "Get the status of a spawned sub-agent by orchestration task ID. Returns current status, result, and linked task run info.",
        inputSchema: {
          type: "object" as const,
          properties: {
            orchestrationTaskId: {
              type: "string",
              description: "The orchestration task ID returned from spawn_agent",
            },
          },
          required: ["orchestrationTaskId"],
        },
      },
      {
        name: "wait_for_agent",
        description: "Wait for a spawned sub-agent to reach a terminal state (completed, failed, or cancelled). Polls every 5 seconds until the agent finishes or timeout.",
        inputSchema: {
          type: "object" as const,
          properties: {
            orchestrationTaskId: {
              type: "string",
              description: "The orchestration task ID to wait for",
            },
            timeout: {
              type: "number",
              description: "Maximum wait time in milliseconds (default: 300000 = 5 minutes)",
            },
          },
          required: ["orchestrationTaskId"],
        },
      },
      {
        name: "list_spawned_agents",
        description: "List all sub-agents spawned by this orchestration. Returns status summary of all tasks.",
        inputSchema: {
          type: "object" as const,
          properties: {
            status: {
              type: "string",
              enum: ["pending", "assigned", "running", "completed", "failed", "cancelled"],
              description: "Filter by status (optional)",
            },
          },
        },
      },
      {
        name: "cancel_agent",
        description: "Cancel a running or pending sub-agent. The agent will stop and its status will be set to cancelled.",
        inputSchema: {
          type: "object" as const,
          properties: {
            orchestrationTaskId: {
              type: "string",
              description: "The orchestration task ID to cancel",
            },
            cascade: {
              type: "boolean",
              description: "Also cancel dependent tasks (default: false)",
            },
          },
          required: ["orchestrationTaskId"],
        },
      },
      {
        name: "get_orchestration_summary",
        description: "Get a summary of the current orchestration including task counts by status, active agents, and recent completions.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "bind_provider_session",
        description:
          "Bind a provider-specific session ID to the current task. Use to enable session resume on task retry. " +
          "Claude agents should call this with their session ID, Codex agents with their thread ID.",
        inputSchema: {
          type: "object" as const,
          properties: {
            providerSessionId: {
              type: "string",
              description: "Claude session ID or equivalent for the provider",
            },
            providerThreadId: {
              type: "string",
              description: "Codex thread ID or equivalent for thread-based providers",
            },
            replyChannel: {
              type: "string",
              enum: ["mailbox", "sse", "pty", "ui"],
              description: "Preferred communication channel for receiving messages",
            },
          },
        },
      },
      {
        name: "get_provider_session",
        description:
          "Get the provider session binding for a task. Use to check if a session can be resumed.",
        inputSchema: {
          type: "object" as const,
          properties: {
            taskId: {
              type: "string",
              description: "The orchestration task ID to get session for (optional, uses current task)",
            },
          },
        },
      },
      {
        name: "wait_for_events",
        description:
          "Wait for orchestration events using SSE streaming. Returns when a matching event arrives or timeout. " +
          "More efficient than polling wait_for_agent. Use for event-driven head agent loops.",
        inputSchema: {
          type: "object" as const,
          properties: {
            orchestrationId: {
              type: "string",
              description: "The orchestration ID to subscribe to events for",
            },
            eventTypes: {
              type: "array",
              items: { type: "string" },
              description:
                "Event types to wait for (e.g., ['task_completed', 'approval_required']). " +
                "If empty, returns on any event.",
            },
            timeout: {
              type: "number",
              description: "Maximum wait time in milliseconds (default: 30000 = 30 seconds)",
            },
          },
          required: ["orchestrationId"],
        },
      },
      {
        name: "get_pending_approvals",
        description:
          "Get pending approval requests for the current orchestration. " +
          "Returns approvals that require human decision before agents can proceed.",
        inputSchema: {
          type: "object" as const,
          properties: {
            orchestrationId: {
              type: "string",
              description: "The orchestration ID to get pending approvals for (optional, uses current if not provided)",
            },
          },
        },
      },
      {
        name: "resolve_approval",
        description:
          "Resolve a pending approval request. Use to approve or deny actions that require human authorization.",
        inputSchema: {
          type: "object" as const,
          properties: {
            requestId: {
              type: "string",
              description: "The approval request ID (apr_xxx format)",
            },
            resolution: {
              type: "string",
              enum: ["allow", "allow_once", "allow_session", "deny", "deny_always"],
              description:
                "Resolution decision: allow (permit action), allow_once (permit this time only), " +
                "allow_session (permit for session), deny (reject), deny_always (block permanently)",
            },
            note: {
              type: "string",
              description: "Optional note explaining the decision",
            },
          },
          required: ["requestId", "resolution"],
        },
      },
      {
        name: "refresh_policy_rules",
        description:
          "Fetch the latest centralized policy rules from the server and update local instruction files. " +
          "Use this to get updated policies without restarting the sandbox. Requires CMUX_TASK_RUN_JWT.",
        inputSchema: {
          type: "object" as const,
          properties: {},
        },
      },
      {
        name: "log_learning",
        description:
          "Log an orchestration learning, error, or feature request to the server. " +
          "Learnings captured here are reviewed by team leads and may be promoted to active orchestration rules. " +
          "Requires CMUX_TASK_RUN_JWT.",
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              enum: ["learning", "error", "feature_request"],
              description: "Type of event to log",
            },
            text: {
              type: "string",
              description: "The learning, error description, or feature request text",
            },
            lane: {
              type: "string",
              enum: ["hot", "orchestration", "project"],
              description: "Suggested lane for the rule (default: orchestration)",
            },
            confidence: {
              type: "number",
              description: "Confidence score 0.0-1.0 (default: 0.5 for learnings, 0.8 for errors)",
            },
            metadata: {
              type: "object",
              description: "Optional metadata (e.g., error stack, related task IDs)",
            },
          },
          required: ["type", "text"],
        },
      },
      {
        name: "get_active_orchestration_rules",
        description:
          "Fetch the currently active orchestration rules for this team. " +
          "Returns rules that are injected into agent instruction files. " +
          "Requires CMUX_TASK_RUN_JWT.",
        inputSchema: {
          type: "object" as const,
          properties: {
            lane: {
              type: "string",
              enum: ["hot", "orchestration", "project"],
              description: "Filter by lane (optional)",
            },
          },
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_memory": {
        const { type, includeCompleted, limit } = args as {
          type: string;
          includeCompleted?: boolean;
          limit?: number;
        };
        // Track usage for memory freshness
        trackRead(type);

        let content: string | null = null;
        if (type === "knowledge") {
          content = readFile(path.join(knowledgeDir, "MEMORY.md"));
        } else if (type === "tasks") {
          // Filter tasks to prevent context bloat
          const tasksFile = readTasks();
          const maxTasks = limit ?? 50;
          const showCompleted = includeCompleted ?? false;

          // Filter to open tasks by default, sort by ID (newest first)
          let filteredTasks = showCompleted
            ? tasksFile.tasks
            : tasksFile.tasks.filter((t) => t.status === "pending" || t.status === "in_progress");

          // Sort by ID descending (assuming IDs are sequential)
          filteredTasks = filteredTasks.sort((a, b) => {
            const aNum = parseInt(a.id.replace(/\D/g, ""), 10) || 0;
            const bNum = parseInt(b.id.replace(/\D/g, ""), 10) || 0;
            return bNum - aNum;
          });

          // Apply limit
          const truncated = filteredTasks.length > maxTasks;
          filteredTasks = filteredTasks.slice(0, maxTasks);

          const result = {
            version: tasksFile.version,
            tasks: filteredTasks,
            _meta: {
              totalTasks: tasksFile.tasks.length,
              openTasks: tasksFile.tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length,
              returnedTasks: filteredTasks.length,
              truncated,
              includeCompleted: showCompleted,
            },
          };
          content = JSON.stringify(result, null, 2);
        } else if (type === "mailbox") {
          content = readFile(mailboxPath);
        }
        return {
          content: [{ type: "text", text: content ?? `No ${type} content found.` }],
        };
      }

      case "list_daily_logs": {
        const dates = listDailyLogs();
        return {
          content: [{ type: "text", text: dates.length > 0 ? dates.join("\n") : "No daily logs found." }],
        };
      }

      case "read_daily_log": {
        const date = (args as { date: string }).date;
        const content = readFile(path.join(dailyDir, `${date}.md`));
        return {
          content: [{ type: "text", text: content ?? `No log found for ${date}.` }],
        };
      }

      case "search_memory": {
        const query = (args as { query: string }).query;
        const results = searchMemory(query);
        if (results.length === 0) {
          return { content: [{ type: "text", text: `No results found for "${query}".` }] };
        }
        const formatted = results
          .map((r) => `[${r.source}${r.line ? `:${r.line}` : ""}] ${r.content}`)
          .join("\n");
        return { content: [{ type: "text", text: formatted }] };
      }

      case "get_memory_usage": {
        const stats = readUsageStats();
        if (Object.keys(stats.entries).length === 0) {
          return { content: [{ type: "text", text: "No usage statistics recorded yet." }] };
        }
        // Calculate freshness scores (Q4 Phase 3b)
        const now = Date.now();
        const entries = Object.entries(stats.entries).map(([key, value]) => {
          const daysSinceRead = Math.floor((now - new Date(value.lastRead).getTime()) / (1000 * 60 * 60 * 24));
          const daysSinceWrite = value.lastWrite
            ? Math.floor((now - new Date(value.lastWrite).getTime()) / (1000 * 60 * 60 * 24))
            : null;

          // Freshness scoring algorithm
          // Factors: recency (40%), usage frequency (40%), type priority (20%)
          const recencyScore = Math.max(0, 100 - daysSinceRead * 3); // -3 points per day
          const usageScore = Math.min(100, value.readCount * 10); // +10 per read, max 100
          const priorityScore = key.includes("P0") ? 100 : key.includes("P1") ? 50 : key.includes("P2") ? 25 : 50;
          const freshnessScore = Math.round(recencyScore * 0.4 + usageScore * 0.4 + priorityScore * 0.2);

          // Recommendation based on score
          let recommendation: "keep" | "review" | "archive";
          if (freshnessScore >= 60) recommendation = "keep";
          else if (freshnessScore >= 30) recommendation = "review";
          else recommendation = "archive";

          return {
            type: key,
            readCount: value.readCount,
            daysSinceRead,
            daysSinceWrite,
            freshnessScore,
            recommendation,
          };
        });

        // Summary stats
        const keepCount = entries.filter(e => e.recommendation === "keep").length;
        const reviewCount = entries.filter(e => e.recommendation === "review").length;
        const archiveCount = entries.filter(e => e.recommendation === "archive").length;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              summary: { keep: keepCount, review: reviewCount, archive: archiveCount },
              entries,
            }, null, 2)
          }]
        };
      }

      case "send_message": {
        const { to, message, type, correlationId, replyTo, priority, metadata } = args as {
          to: string;
          message: string;
          type?: "handoff" | "request" | "status" | "response";
          correlationId?: string;
          replyTo?: string;
          priority?: "high" | "normal" | "low";
          metadata?: Record<string, unknown>;
        };
        const mailbox = readMailbox();
        const newMessage: MailboxMessage = {
          id: generateMessageId(),
          from: agentName,
          to,
          type: type ?? "request",
          message,
          timestamp: new Date().toISOString(),
          read: false,
          correlationId,
          replyTo,
          priority,
          metadata,
        };
        mailbox.messages.push(newMessage);
        writeMailbox(mailbox);

        // Include correlationId in response for easy tracking
        const responseText = correlationId
          ? `Message sent successfully. ID: ${newMessage.id}, correlationId: ${correlationId}`
          : `Message sent successfully. ID: ${newMessage.id}`;
        return { content: [{ type: "text", text: responseText }] };
      }

      case "get_my_messages": {
        const { includeRead, correlationId, type: filterType } = args as {
          includeRead?: boolean;
          correlationId?: string;
          type?: "handoff" | "request" | "status" | "response";
        };
        const mailbox = readMailbox();
        let myMessages = mailbox.messages.filter(
          (m) => m.to === agentName || m.to === "*"
        );

        // Apply filters
        if (!includeRead) {
          myMessages = myMessages.filter((m) => !m.read);
        }
        if (correlationId) {
          myMessages = myMessages.filter((m) => m.correlationId === correlationId);
        }
        if (filterType) {
          myMessages = myMessages.filter((m) => m.type === filterType);
        }

        // Sort by priority (high first) then by timestamp (newest first)
        const priorityOrder = { high: 0, normal: 1, low: 2, undefined: 1 };
        myMessages.sort((a, b) => {
          const pa = priorityOrder[a.priority ?? "normal"];
          const pb = priorityOrder[b.priority ?? "normal"];
          if (pa !== pb) return pa - pb;
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

        if (myMessages.length === 0) {
          return { content: [{ type: "text", text: "No messages for you." }] };
        }
        const formatted = myMessages
          .map((m) => {
            const priorityTag = m.priority === "high" ? "[HIGH] " : m.priority === "low" ? "[low] " : "";
            const corrTag = m.correlationId ? ` (corr: ${m.correlationId})` : "";
            return `${priorityTag}[${m.id}] ${m.type ?? "message"} from ${m.from}${corrTag}: ${m.message}`;
          })
          .join("\n\n");
        return { content: [{ type: "text", text: formatted }] };
      }

      case "mark_read": {
        const messageId = (args as { messageId: string }).messageId;
        const mailbox = readMailbox();
        const message = mailbox.messages.find((m) => m.id === messageId);
        if (!message) {
          return { content: [{ type: "text", text: `Message ${messageId} not found.` }] };
        }
        message.read = true;
        writeMailbox(mailbox);
        return { content: [{ type: "text", text: `Message ${messageId} marked as read.` }] };
      }

      // Write tool handlers
      case "append_daily_log": {
        const { content } = args as { content: string };
        const today = getTodayDateString();
        ensureDir(dailyDir);
        const logPath = path.join(dailyDir, `${today}.md`);
        const existing = readFile(logPath) ?? `# Daily Log: ${today}\n\n> Session-specific observations. Temporary notes go here.\n\n---\n`;
        const timestamp = new Date().toISOString().split("T")[1].split(".")[0];
        const newContent = existing + `\n- [${timestamp}] ${content}`;
        if (writeFile(logPath, newContent)) {
          return { content: [{ type: "text", text: `Appended to daily/${today}.md` }] };
        }
        return { content: [{ type: "text", text: `Failed to append to daily log` }] };
      }

      case "update_knowledge": {
        const { section, content } = args as { section: "P0" | "P1" | "P2"; content: string };
        // Track usage for memory freshness
        trackWrite(`knowledge.${section}`);
        ensureDir(knowledgeDir);
        const knowledgePath = path.join(knowledgeDir, "MEMORY.md");
        let existing = readFile(knowledgePath);

        // Create default structure if file doesn't exist
        if (!existing) {
          existing = `# Project Knowledge

> Curated insights organized by priority. Add date tags for TTL tracking.

## P0 - Core (Never Expires)
<!-- Fundamental project facts, configuration, invariants -->

## P1 - Active (90-day TTL)
<!-- Ongoing work context, current strategies, recent decisions -->

## P2 - Reference (30-day TTL)
<!-- Temporary findings, debug notes, one-off context -->

---
*Priority guide: P0 = permanent truth, P1 = active context, P2 = temporary reference*
*Format: - [YYYY-MM-DD] Your insight here*
`;
        }

        const today = getTodayDateString();
        const newEntry = `- [${today}] ${content}`;

        // Find the section header and insert after it
        const sectionHeaders: Record<string, string> = {
          P0: "## P0 - Core (Never Expires)",
          P1: "## P1 - Active (90-day TTL)",
          P2: "## P2 - Reference (30-day TTL)",
        };

        const header = sectionHeaders[section];
        const headerIndex = existing.indexOf(header);

        if (headerIndex === -1) {
          return { content: [{ type: "text", text: `Section ${section} not found in MEMORY.md` }] };
        }

        // Find the next section or end of file
        const afterHeader = existing.slice(headerIndex + header.length);
        const nextSectionMatch = afterHeader.match(/\n## /);
        const insertPoint = nextSectionMatch
          ? headerIndex + header.length + (nextSectionMatch.index ?? afterHeader.length)
          : existing.length;

        // Find the end of the comment line (if any) after the header
        const commentEndMatch = afterHeader.match(/<!--[^>]*-->\n/);
        const commentEnd = commentEndMatch
          ? headerIndex + header.length + (commentEndMatch.index ?? 0) + commentEndMatch[0].length
          : headerIndex + header.length + 1;

        // Insert the new entry after the comment
        const actualInsertPoint = Math.min(commentEnd, insertPoint);
        const updated = existing.slice(0, actualInsertPoint) + newEntry + "\n" + existing.slice(actualInsertPoint);

        if (writeFile(knowledgePath, updated)) {
          return { content: [{ type: "text", text: `Added entry to ${section} section in MEMORY.md` }] };
        }
        return { content: [{ type: "text", text: `Failed to update MEMORY.md` }] };
      }

      case "add_task": {
        const { subject, description } = args as { subject: string; description: string };
        const tasks = readTasks();
        const now = new Date().toISOString();
        const newTask: TaskEntry = {
          id: generateTaskId(),
          subject,
          description,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        tasks.tasks.push(newTask);
        if (writeTasks(tasks)) {
          return { content: [{ type: "text", text: `Task created with ID: ${newTask.id}` }] };
        }
        return { content: [{ type: "text", text: `Failed to create task` }] };
      }

      case "update_task": {
        const { taskId, status } = args as { taskId: string; status: "pending" | "in_progress" | "completed" };
        const tasks = readTasks();
        const task = tasks.tasks.find((t) => t.id === taskId);
        if (!task) {
          return { content: [{ type: "text", text: `Task ${taskId} not found` }] };
        }
        task.status = status;
        task.updatedAt = new Date().toISOString();
        if (writeTasks(tasks)) {
          return { content: [{ type: "text", text: `Task ${taskId} updated to status: ${status}` }] };
        }
        return { content: [{ type: "text", text: `Failed to update task` }] };
      }

      // Orchestration tool handlers
      case "read_orchestration": {
        const type = (args as { type: string }).type;
        let content: string | null = null;
        if (type === "plan") {
          content = readFile(planPath);
        } else if (type === "agents") {
          content = readFile(agentsPath);
        } else if (type === "events") {
          content = readFile(eventsPath);
        }
        return {
          content: [{ type: "text", text: content ?? `No ${type} file found in orchestration directory.` }],
        };
      }

      case "append_event": {
        const { event, message, agentName, taskRunId } = args as {
          event: string;
          message: string;
          agentName?: string;
          taskRunId?: string;
        };
        const eventObj: OrchestrationEvent = {
          timestamp: new Date().toISOString(),
          event,
          message,
        };
        if (agentName) eventObj.agentName = agentName;
        if (taskRunId) eventObj.taskRunId = taskRunId;

        if (appendEvent(eventObj)) {
          return { content: [{ type: "text", text: `Event appended to EVENTS.jsonl` }] };
        }
        return { content: [{ type: "text", text: `Failed to append event` }] };
      }

      case "update_plan_task": {
        const { taskId, status, result, errorMessage } = args as {
          taskId: string;
          status: string;
          result?: string;
          errorMessage?: string;
        };
        const plan = readPlan();
        if (!plan) {
          return { content: [{ type: "text", text: `No PLAN.json found in orchestration directory` }] };
        }
        const task = plan.tasks.find((t) => t.id === taskId);
        if (!task) {
          return { content: [{ type: "text", text: `Task ${taskId} not found in PLAN.json` }] };
        }
        task.status = status;
        if (result !== undefined) task.result = result;
        if (errorMessage !== undefined) task.errorMessage = errorMessage;
        if (status === "running" && !task.startedAt) {
          task.startedAt = new Date().toISOString();
        }
        if (status === "completed" || status === "failed" || status === "cancelled") {
          task.completedAt = new Date().toISOString();
        }

        if (writePlan(plan)) {
          return { content: [{ type: "text", text: `Plan task ${taskId} updated to status: ${status}` }] };
        }
        return { content: [{ type: "text", text: `Failed to update plan task` }] };
      }

      case "pull_orchestration_updates": {
        const { orchestrationId: argOrchId } = args as { orchestrationId?: string };
        const orchestrationId = argOrchId ?? process.env.CMUX_ORCHESTRATION_ID;
        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";

        if (!orchestrationId) {
          return {
            content: [{
              type: "text",
              text: "No orchestration ID provided. Pass orchestrationId parameter or set CMUX_ORCHESTRATION_ID env var.",
            }],
          };
        }

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        try {
          // Fetch orchestration tasks from server
          const url = `${apiBaseUrl}/api/v1/cmux/orchestration/${orchestrationId}/sync`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to fetch orchestration updates: ${response.status} ${errorText}`,
              }],
            };
          }

          const serverData = await response.json() as {
            tasks: OrchestrationTask[];
            messages: MailboxMessage[];
            aggregatedStatus: {
              total: number;
              completed: number;
              running: number;
              failed: number;
              pending: number;
            };
          };

          // Update local PLAN.json with server data
          let plan = readPlan();
          if (!plan) {
            plan = {
              version: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: "running",
              headAgent: agentName,
              orchestrationId,
              tasks: [],
            };
          }

          // Merge server tasks into local plan
          for (const serverTask of serverData.tasks) {
            const localTask = plan.tasks.find((t) => t.id === serverTask.id);
            if (localTask) {
              // Update existing task
              localTask.status = serverTask.status;
              localTask.taskRunId = serverTask.taskRunId;
              localTask.result = serverTask.result;
              localTask.errorMessage = serverTask.errorMessage;
              localTask.startedAt = serverTask.startedAt;
              localTask.completedAt = serverTask.completedAt;
            } else {
              // Add new task from server
              plan.tasks.push(serverTask);
            }
          }

          // Update plan status based on aggregated status
          const agg = serverData.aggregatedStatus;
          if (agg.failed > 0) {
            plan.status = "failed";
          } else if (agg.completed === agg.total && agg.total > 0) {
            plan.status = "completed";
          } else if (agg.running > 0) {
            plan.status = "running";
          } else {
            plan.status = "pending";
          }

          writePlan(plan);

          // Update mailbox with new messages
          const mailbox = readMailbox();
          for (const msg of serverData.messages) {
            if (!mailbox.messages.find((m) => m.id === msg.id)) {
              mailbox.messages.push(msg);
            }
          }
          writeMailbox(mailbox);

          // Append sync event
          appendEvent({
            timestamp: new Date().toISOString(),
            event: "orchestration_synced",
            message: `Synced ${serverData.tasks.length} tasks, ${serverData.messages.length} messages`,
            metadata: serverData.aggregatedStatus,
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                synced: true,
                orchestrationId,
                tasks: serverData.tasks.length,
                messages: serverData.messages.length,
                aggregatedStatus: serverData.aggregatedStatus,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error syncing orchestration updates: ${errorMsg}`,
            }],
          };
        }
      }

      case "push_orchestration_updates": {
        const { orchestrationId: argOrchId, headAgentStatus, message, taskIds } = args as {
          orchestrationId?: string;
          headAgentStatus?: "running" | "completed" | "failed";
          message?: string;
          taskIds?: string[];
        };
        const orchestrationId = argOrchId ?? process.env.CMUX_ORCHESTRATION_ID;
        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";

        if (!orchestrationId) {
          return {
            content: [{
              type: "text",
              text: "No orchestration ID provided. Pass orchestrationId parameter or set CMUX_ORCHESTRATION_ID env var.",
            }],
          };
        }

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        try {
          // Read local PLAN.json
          const plan = readPlan();
          if (!plan && !headAgentStatus) {
            return {
              content: [{
                type: "text",
                text: "No PLAN.json found and no headAgentStatus provided. Nothing to push.",
              }],
            };
          }

          // Build tasks to push (completed/failed tasks, or specific taskIds)
          const tasksToPush: Array<{
            id: string;
            status: string;
            result?: string;
            errorMessage?: string;
          }> = [];

          if (plan) {
            for (const task of plan.tasks) {
              // If taskIds specified, only push those
              if (taskIds && taskIds.length > 0 && !taskIds.includes(task.id)) {
                continue;
              }
              // By default, push completed/failed tasks
              if (task.status === "completed" || task.status === "failed") {
                tasksToPush.push({
                  id: task.id,
                  status: task.status,
                  result: task.result,
                  errorMessage: task.errorMessage,
                });
              }
            }
          }

          // POST to server
          const url = `${apiBaseUrl}/api/v1/cmux/orchestration/${orchestrationId}/sync`;
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              orchestrationId,
              headAgentStatus,
              message,
              tasks: tasksToPush.length > 0 ? tasksToPush : undefined,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to push orchestration updates: ${response.status} ${errorText}`,
              }],
            };
          }

          const result = await response.json() as {
            success: boolean;
            tasksUpdated: number;
            message?: string;
          };

          // Append push event
          appendEvent({
            timestamp: new Date().toISOString(),
            event: "orchestration_pushed",
            message: result.message ?? `Pushed ${tasksToPush.length} tasks`,
            metadata: {
              orchestrationId,
              headAgentStatus,
              tasksPushed: tasksToPush.length,
              tasksUpdated: result.tasksUpdated,
            },
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                orchestrationId,
                headAgentStatus,
                tasksPushed: tasksToPush.length,
                tasksUpdated: result.tasksUpdated,
                message: result.message,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error pushing orchestration updates: ${errorMsg}`,
            }],
          };
        }
      }

      case "spawn_agent": {
        const { prompt, agentName: spawnAgentName, repo, branch, dependsOn, priority } = args as {
          prompt: string;
          agentName: string;
          repo?: string;
          branch?: string;
          dependsOn?: string[];
          priority?: number;
        };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        // spawn_agent uses apps/server API, not apps/www
        const serverUrl = process.env.CMUX_SERVER_URL ?? "https://cmux-server.karldigi.dev";
        const orchestrationId = process.env.CMUX_ORCHESTRATION_ID;

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        try {
          const url = `${serverUrl}/api/orchestrate/spawn`;
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "X-Task-Run-JWT": jwt,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt,
              agent: spawnAgentName,
              repo,
              branch,
              dependsOn,
              priority: priority ?? 5,
              orchestrationId,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to spawn agent: ${response.status} ${errorText}`,
              }],
            };
          }

          const result = await response.json() as {
            orchestrationTaskId: string;
            taskId: string;
            taskRunId: string;
            agentName: string;
            status: string;
          };

          // Update local PLAN.json
          let plan = readPlan();
          if (!plan && orchestrationId) {
            plan = {
              version: 1,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              status: "running",
              headAgent: agentName,
              orchestrationId,
              tasks: [],
            };
          }

          if (plan) {
            plan.tasks.push({
              id: result.orchestrationTaskId,
              prompt,
              agentName: spawnAgentName,
              status: result.status,
              taskRunId: result.taskRunId,
              dependsOn,
              priority: priority ?? 5,
              createdAt: new Date().toISOString(),
            });
            writePlan(plan);
          }

          // Append spawn event
          appendEvent({
            timestamp: new Date().toISOString(),
            event: "agent_spawned",
            message: `Spawned ${spawnAgentName} for: ${prompt.slice(0, 50)}...`,
            agentName: spawnAgentName,
            taskRunId: result.taskRunId,
          });

          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error spawning agent: ${errorMsg}`,
            }],
          };
        }
      }

      case "get_agent_status": {
        const { orchestrationTaskId } = args as { orchestrationTaskId: string };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        // Use apps/server API (same as spawn_agent)
        const serverUrl = process.env.CMUX_SERVER_URL ?? "https://cmux-server.karldigi.dev";

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        const teamId = extractTeamIdFromJwt(jwt);
        if (!teamId) {
          return {
            content: [{
              type: "text",
              text: "Failed to extract teamId from JWT token.",
            }],
          };
        }

        try {
          const url = `${serverUrl}/api/orchestrate/status/${orchestrationTaskId}?teamSlugOrId=${encodeURIComponent(teamId)}`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "X-Task-Run-JWT": jwt,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to get agent status: ${response.status} ${errorText}`,
              }],
            };
          }

          const result = await response.json();
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error getting agent status: ${errorMsg}`,
            }],
          };
        }
      }

      case "wait_for_agent": {
        const { orchestrationTaskId, timeout = 300000 } = args as {
          orchestrationTaskId: string;
          timeout?: number;
        };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        // Use apps/server API (same as spawn_agent)
        const serverUrl = process.env.CMUX_SERVER_URL ?? "https://cmux-server.karldigi.dev";

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        const teamId = extractTeamIdFromJwt(jwt);
        if (!teamId) {
          return {
            content: [{
              type: "text",
              text: "Failed to extract teamId from JWT token.",
            }],
          };
        }

        const startTime = Date.now();
        const pollInterval = 5000; // 5 seconds

        try {
          while (Date.now() - startTime < timeout) {
            const url = `${serverUrl}/api/orchestrate/status/${orchestrationTaskId}?teamSlugOrId=${encodeURIComponent(teamId)}`;
            const response = await fetch(url, {
              method: "GET",
              headers: {
                "X-Task-Run-JWT": jwt,
                "Content-Type": "application/json",
              },
            });

            if (!response.ok) {
              const errorText = await response.text();
              return {
                content: [{
                  type: "text",
                  text: `Failed to get agent status: ${response.status} ${errorText}`,
                }],
              };
            }

            const result = await response.json() as {
              task: {
                status: string;
                result?: string;
                errorMessage?: string;
                prompt?: string;
              };
              taskRun?: {
                status?: string;
              } | null;
            };

            const status = result.task.status;

            // Check for terminal states
            if (status === "completed" || status === "failed" || status === "cancelled") {
              appendEvent({
                timestamp: new Date().toISOString(),
                event: "agent_wait_completed",
                message: `Agent ${orchestrationTaskId} reached terminal state: ${status}`,
                taskRunId: orchestrationTaskId,
                status,
              });

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    orchestrationTaskId,
                    status,
                    result: result.task.result ?? null,
                    errorMessage: result.task.errorMessage ?? null,
                    waitDuration: Date.now() - startTime,
                  }, null, 2),
                }],
              };
            }

            // Wait before next poll
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
          }

          // Timeout reached
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                orchestrationTaskId,
                status: "timeout",
                message: `Timed out waiting for agent after ${timeout}ms`,
                waitDuration: Date.now() - startTime,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error waiting for agent: ${errorMsg}`,
            }],
          };
        }
      }

      case "list_spawned_agents": {
        const { status: filterStatus } = args as { status?: string };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";
        const orchestrationId = process.env.CMUX_ORCHESTRATION_ID;

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        if (!orchestrationId) {
          return {
            content: [{
              type: "text",
              text: "CMUX_ORCHESTRATION_ID environment variable not set.",
            }],
          };
        }

        try {
          let url = `${apiBaseUrl}/api/v1/cmux/orchestration/${orchestrationId}/tasks`;
          if (filterStatus) {
            url += `?status=${filterStatus}`;
          }

          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to list agents: ${response.status} ${errorText}`,
              }],
            };
          }

          const result = await response.json();
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error listing agents: ${errorMsg}`,
            }],
          };
        }
      }

      case "cancel_agent": {
        const { orchestrationTaskId, cascade = false } = args as {
          orchestrationTaskId: string;
          cascade?: boolean;
        };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        try {
          const url = `${apiBaseUrl}/api/orchestrate/cancel/${orchestrationTaskId}`;
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "X-Task-Run-JWT": jwt,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ cascade }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to cancel agent: ${response.status} ${errorText}`,
              }],
            };
          }

          const result = await response.json() as { ok: boolean; cancelledCount?: number };

          // Append cancel event
          appendEvent({
            timestamp: new Date().toISOString(),
            event: "agent_cancelled",
            message: `Cancelled agent ${orchestrationTaskId}${cascade ? ` (cascade: ${result.cancelledCount} total)` : ""}`,
            taskRunId: orchestrationTaskId,
          });

          // Update local PLAN.json
          const plan = readPlan();
          if (plan) {
            const task = plan.tasks.find((t) => t.id === orchestrationTaskId);
            if (task) {
              task.status = "cancelled";
              task.completedAt = new Date().toISOString();
              writePlan(plan);
            }
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                ok: true,
                orchestrationTaskId,
                cancelled: true,
                cascade,
                cancelledCount: result.cancelledCount ?? 1,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error cancelling agent: ${errorMsg}`,
            }],
          };
        }
      }

      case "get_orchestration_summary": {
        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";
        const orchestrationId = process.env.CMUX_ORCHESTRATION_ID;

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        if (!orchestrationId) {
          return {
            content: [{
              type: "text",
              text: "CMUX_ORCHESTRATION_ID environment variable not set.",
            }],
          };
        }

        try {
          // Get sync data which includes aggregated status
          const url = `${apiBaseUrl}/api/v1/cmux/orchestration/${orchestrationId}/sync`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to get orchestration summary: ${response.status} ${errorText}`,
              }],
            };
          }

          const data = await response.json() as {
            tasks: Array<{
              id: string;
              prompt: string;
              agentName: string;
              status: string;
              result?: string;
              errorMessage?: string;
            }>;
            aggregatedStatus: {
              total: number;
              completed: number;
              running: number;
              failed: number;
              pending: number;
            };
          };

          // Build summary
          const activeAgents = data.tasks
            .filter((t) => t.status === "running")
            .map((t) => t.agentName);

          const recentCompletions = data.tasks
            .filter((t) => t.status === "completed" || t.status === "failed")
            .slice(-5)
            .map((t) => ({
              id: t.id,
              status: t.status,
              prompt: t.prompt.slice(0, 50) + (t.prompt.length > 50 ? "..." : ""),
              result: t.result?.slice(0, 100),
              error: t.errorMessage?.slice(0, 100),
            }));

          const summary = {
            orchestrationId,
            status: data.aggregatedStatus,
            activeAgents,
            activeAgentCount: activeAgents.length,
            recentCompletions,
            allTasksComplete: data.aggregatedStatus.pending === 0 && data.aggregatedStatus.running === 0,
            hasFailures: data.aggregatedStatus.failed > 0,
          };

          return {
            content: [{
              type: "text",
              text: JSON.stringify(summary, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error getting orchestration summary: ${errorMsg}`,
            }],
          };
        }
      }

      case "bind_provider_session": {
        const { providerSessionId, providerThreadId, replyChannel } = args as {
          providerSessionId?: string;
          providerThreadId?: string;
          replyChannel?: "mailbox" | "sse" | "pty" | "ui";
        };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";
        const orchestrationId = process.env.CMUX_ORCHESTRATION_ID;
        const taskRunId = process.env.CMUX_TASK_RUN_ID;

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set.",
            }],
          };
        }

        // orchestrationId is optional - API will use taskRunId from JWT as fallback
        try {
          const url = `${apiBaseUrl}/api/v1/cmux/orchestration/sessions/bind`;
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              // Only include orchestrationId if set, otherwise API uses taskRunId from JWT
              ...(orchestrationId && { orchestrationId }),
              taskRunId,
              providerSessionId,
              providerThreadId,
              replyChannel,
              agentName,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to bind session: ${response.status} ${errorText}`,
              }],
            };
          }

          const result = await response.json();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Provider session bound successfully",
                bindingId: result.bindingId,
                updated: result.updated,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error binding provider session: ${errorMsg}`,
            }],
          };
        }
      }

      case "get_provider_session": {
        const { taskId: providedTaskId } = args as { taskId?: string };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";
        const taskId = providedTaskId ?? process.env.CMUX_TASK_RUN_ID;

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set.",
            }],
          };
        }

        if (!taskId) {
          return {
            content: [{
              type: "text",
              text: "No task ID provided and CMUX_TASK_RUN_ID not set.",
            }],
          };
        }

        try {
          const url = `${apiBaseUrl}/api/v1/cmux/orchestration/sessions/${taskId}`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${jwt}`,
            },
          });

          if (!response.ok) {
            if (response.status === 404) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    found: false,
                    message: "No provider session binding found for this task",
                  }, null, 2),
                }],
              };
            }
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to get session: ${response.status} ${errorText}`,
              }],
            };
          }

          const session = await response.json();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                found: true,
                taskId: session.taskId,
                orchestrationId: session.orchestrationId,
                provider: session.provider,
                agentName: session.agentName,
                mode: session.mode,
                providerSessionId: session.providerSessionId,
                providerThreadId: session.providerThreadId,
                replyChannel: session.replyChannel,
                status: session.status,
                lastActiveAt: session.lastActiveAt,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error getting provider session: ${errorMsg}`,
            }],
          };
        }
      }

      case "wait_for_events": {
        const { orchestrationId, eventTypes = [], timeout = 30000 } = args as {
          orchestrationId: string;
          eventTypes?: string[];
          timeout?: number;
        };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        const startTime = Date.now();
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

        try {
          // Use the v2 SSE endpoint for typed events
          const url = `${apiBaseUrl}/api/orchestrate/v2/events/${orchestrationId}`;
          const controller = new AbortController();

          // Set up timeout that aborts the controller - this affects both fetch and stream
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${jwt}`,
              "Accept": "text/event-stream",
            },
            signal: controller.signal,
          });

          if (!response.ok) {
            clearTimeout(timeoutId);
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to connect to event stream: ${response.status} ${errorText}`,
              }],
            };
          }

          // Read the SSE stream for matching events
          reader = response.body?.getReader();
          if (!reader) {
            clearTimeout(timeoutId);
            return {
              content: [{
                type: "text",
                text: "No response body from event stream",
              }],
            };
          }

          const decoder = new TextDecoder();
          let buffer = "";

          while (Date.now() - startTime < timeout) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const event = JSON.parse(line.slice(6));
                  // Check if event matches filter
                  if (eventTypes.length === 0 || eventTypes.includes(event.type)) {
                    clearTimeout(timeoutId);
                    return {
                      content: [{
                        type: "text",
                        text: JSON.stringify({
                          event,
                          waitDuration: Date.now() - startTime,
                        }, null, 2),
                      }],
                    };
                  }
                } catch {
                  // Ignore parse errors for non-JSON lines
                }
              }
            }
          }

          clearTimeout(timeoutId);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "timeout",
                message: `No matching events received within ${timeout}ms`,
                eventTypesFilter: eventTypes,
                waitDuration: Date.now() - startTime,
              }, null, 2),
            }],
          };
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  status: "timeout",
                  message: `Connection timed out after ${timeout}ms`,
                }, null, 2),
              }],
            };
          }
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error waiting for events: ${errorMsg}`,
            }],
          };
        } finally {
          // Ensure reader is always cleaned up
          if (reader) {
            try {
              reader.cancel();
            } catch {
              // Ignore cancel errors
            }
          }
        }
      }

      case "get_pending_approvals": {
        const { orchestrationId: providedOrchId } = args as { orchestrationId?: string };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";
        const orchestrationId = providedOrchId ?? process.env.CMUX_ORCHESTRATION_ID;

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        if (!orchestrationId) {
          return {
            content: [{
              type: "text",
              text: "No orchestration ID provided and CMUX_ORCHESTRATION_ID not set.",
            }],
          };
        }

        try {
          const url = `${apiBaseUrl}/api/orchestrate/approvals/${orchestrationId}/pending`;
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to get pending approvals: ${response.status} ${errorText}`,
              }],
            };
          }

          const approvals = await response.json();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                orchestrationId,
                pendingCount: Array.isArray(approvals) ? approvals.length : 0,
                approvals,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error getting pending approvals: ${errorMsg}`,
            }],
          };
        }
      }

      case "resolve_approval": {
        const { requestId, resolution, note } = args as {
          requestId: string;
          resolution: string;
          note?: string;
        };

        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBaseUrl = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        try {
          const url = `${apiBaseUrl}/api/orchestrate/approvals/${requestId}/resolve`;
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${jwt}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ resolution, note }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to resolve approval: ${response.status} ${errorText}`,
              }],
            };
          }

          const result = await response.json();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                requestId,
                resolution,
                status: "resolved",
                ...result,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error resolving approval: ${errorMsg}`,
            }],
          };
        }
      }

      case "refresh_policy_rules": {
        const jwt = process.env.CMUX_TASK_RUN_JWT;
        // CMUX_CALLBACK_URL is the Convex HTTP endpoint URL
        const callbackUrl = process.env.CMUX_CALLBACK_URL;
        const agentNameFull = process.env.CMUX_AGENT_NAME; // e.g., "claude/sonnet-4"
        const isOrchestrationHead = process.env.CMUX_IS_ORCHESTRATION_HEAD === "1";

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "CMUX_TASK_RUN_JWT environment variable not set. This tool requires JWT authentication.",
            }],
          };
        }

        if (!callbackUrl) {
          return {
            content: [{
              type: "text",
              text: "CMUX_CALLBACK_URL environment variable not set. Cannot reach policy server.",
            }],
          };
        }

        if (!agentNameFull) {
          return {
            content: [{
              type: "text",
              text: "CMUX_AGENT_NAME environment variable not set. Cannot determine agent type.",
            }],
          };
        }

        // Extract agent type from full name (e.g., "claude/sonnet-4" -> "claude")
        const agentType = agentNameFull.split("/")[0];
        const validAgentTypes = ["claude", "codex", "gemini", "opencode"];
        if (!validAgentTypes.includes(agentType)) {
          return {
            content: [{
              type: "text",
              text: `Unknown agent type '${agentType}'. Expected one of: ${validAgentTypes.join(", ")}`,
            }],
          };
        }

        // Determine context from environment
        // Head agents run in cloud_workspace context, sub-agents run in task_sandbox
        const context = isOrchestrationHead ? "cloud_workspace" : "task_sandbox";

        try {
          // Build URL with required query parameters
          const url = new URL(`${callbackUrl}/api/agent/policy-rules`);
          url.searchParams.set("agentType", agentType);
          url.searchParams.set("context", context);

          // Fetch latest policy rules from server
          const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
              "x-cmux-token": jwt,
              "Convex-Client": "node-1.0.0",
            },
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Failed to fetch policy rules: ${response.status} ${errorText}`,
              }],
            };
          }

          const result = await response.json() as {
            rules: Array<{
              ruleId: string;
              name: string;
              category: string;
              ruleText: string;
              priority: number;
              scope: string;
            }>;
          };

          if (!result.rules || result.rules.length === 0) {
            return {
              content: [{
                type: "text",
                text: "No policy rules found for this context.",
              }],
            };
          }

          // Format rules as markdown and update instruction files
          const categoryOrder: Record<string, number> = {
            git_policy: 1,
            security: 2,
            workflow: 3,
            tool_restriction: 4,
            custom: 5,
          };
          const categoryLabels: Record<string, string> = {
            git_policy: "Git Policy",
            security: "Security",
            workflow: "Workflow",
            tool_restriction: "Tool Restrictions",
            custom: "Custom",
          };

          // Group rules by category
          const byCategory = new Map<string, typeof result.rules>();
          for (const rule of result.rules) {
            const existing = byCategory.get(rule.category) ?? [];
            existing.push(rule);
            byCategory.set(rule.category, existing);
          }

          // Sort rules within each category by priority
          for (const rules of byCategory.values()) {
            rules.sort((a, b) => a.priority - b.priority);
          }

          // Build markdown
          let markdown = "# Agent Policy Rules\n\n";
          markdown += "> These rules are centrally managed by cmux and override repo-level rules.\n";
          markdown += `> Last refreshed: ${new Date().toISOString()}\n\n`;

          const sortedCategories = Array.from(byCategory.keys()).sort(
            (a, b) => (categoryOrder[a] ?? 99) - (categoryOrder[b] ?? 99)
          );

          for (const category of sortedCategories) {
            const rules = byCategory.get(category);
            if (!rules || rules.length === 0) continue;

            const label = categoryLabels[category] ?? category;
            markdown += `## ${label}\n\n`;

            for (const rule of rules) {
              markdown += `${rule.ruleText}\n\n`;
            }
          }

          // Try to update local instruction files
          const updates: string[] = [];
          const claudeMdPath = path.join(process.env.HOME ?? "/root", ".claude", "CLAUDE.md");
          const codexMdPath = path.join(process.env.HOME ?? "/root", ".codex", "instructions.md");

          // Read existing file, find policy rules section, and replace it
          const updateInstructionFile = (filePath: string): boolean => {
            try {
              let content: string;
              try {
                content = fs.readFileSync(filePath, "utf-8");
              } catch {
                // File doesn't exist
                return false;
              }
              const policyMarkerStart = "# Agent Policy Rules";
              const startIdx = content.indexOf(policyMarkerStart);

              if (startIdx === -1) {
                // No existing policy section, prepend it after the first heading
                const firstHeadingEnd = content.indexOf("\n\n");
                if (firstHeadingEnd > 0) {
                  content = content.slice(0, firstHeadingEnd + 2) + markdown + "\n" + content.slice(firstHeadingEnd + 2);
                } else {
                  content = markdown + "\n" + content;
                }
              } else {
                // Find the end of the policy section (next top-level heading or memory protocol)
                const nextHeadingMatch = content.slice(startIdx + policyMarkerStart.length).match(/\n# [A-Z]/);
                const memoryProtocolMatch = content.slice(startIdx + policyMarkerStart.length).match(/\n## cmux Agent Memory Protocol/);

                let endIdx: number;
                if (memoryProtocolMatch && memoryProtocolMatch.index !== undefined) {
                  endIdx = startIdx + policyMarkerStart.length + memoryProtocolMatch.index;
                } else if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
                  endIdx = startIdx + policyMarkerStart.length + nextHeadingMatch.index;
                } else {
                  endIdx = content.length;
                }

                content = content.slice(0, startIdx) + markdown + content.slice(endIdx);
              }

              fs.writeFileSync(filePath, content, "utf-8");
              return true;
            } catch {
              return false;
            }
          };

          if (updateInstructionFile(claudeMdPath)) {
            updates.push("~/.claude/CLAUDE.md");
          }
          if (updateInstructionFile(codexMdPath)) {
            updates.push("~/.codex/instructions.md");
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                refreshed: true,
                rulesCount: result.rules.length,
                categories: sortedCategories,
                updatedFiles: updates,
                message: updates.length > 0
                  ? `Successfully refreshed ${result.rules.length} policy rules. Updated: ${updates.join(", ")}`
                  : `Fetched ${result.rules.length} policy rules but could not update local files.`,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error refreshing policy rules: ${errorMsg}`,
            }],
          };
        }
      }

      case "log_learning": {
        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBase = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "Error: CMUX_TASK_RUN_JWT not set. This tool requires authentication.",
            }],
          };
        }

        const { type, text, lane, confidence, metadata } = args as {
          type: "learning" | "error" | "feature_request";
          text: string;
          lane?: "hot" | "orchestration" | "project";
          confidence?: number;
          metadata?: Record<string, unknown>;
        };

        try {
          const eventType = type === "learning" ? "learning_logged"
            : type === "error" ? "error_logged"
            : "feature_request_logged";

          const response = await fetch(`${apiBase}/api/v1/cmux/orchestration/learning/log`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cmux-token": jwt,
            },
            body: JSON.stringify({
              eventType,
              text,
              lane: lane ?? "orchestration",
              confidence: confidence ?? (type === "error" ? 0.8 : 0.5),
              metadata,
            }),
          });

          if (!response.ok) {
            const errText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Error logging ${type}: ${response.status} ${errText}`,
              }],
            };
          }

          const result = await response.json();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                logged: true,
                eventType,
                eventId: result.eventId,
                ruleId: result.ruleId,
                message: `Successfully logged ${type}. It will be reviewed for promotion to active rules.`,
              }, null, 2),
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error logging ${type}: ${errorMsg}`,
            }],
          };
        }
      }

      case "get_active_orchestration_rules": {
        const jwt = process.env.CMUX_TASK_RUN_JWT;
        const apiBase = process.env.CMUX_API_BASE_URL ?? "https://cmux.sh";

        if (!jwt) {
          return {
            content: [{
              type: "text",
              text: "Error: CMUX_TASK_RUN_JWT not set. This tool requires authentication.",
            }],
          };
        }

        const { lane } = args as { lane?: "hot" | "orchestration" | "project" };

        try {
          const url = new URL(`${apiBase}/api/v1/cmux/orchestration/rules`);
          if (lane) {
            url.searchParams.set("lane", lane);
          }

          const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
              "x-cmux-token": jwt,
            },
          });

          if (!response.ok) {
            const errText = await response.text();
            return {
              content: [{
                type: "text",
                text: `Error fetching orchestration rules: ${response.status} ${errText}`,
              }],
            };
          }

          const result = await response.json();
          const rules = result.rules ?? [];

          // Group by lane for display
          const byLane = new Map<string, Array<{ text: string; confidence: number }>>();
          for (const rule of rules) {
            const laneRules = byLane.get(rule.lane) ?? [];
            laneRules.push({ text: rule.text, confidence: rule.confidence });
            byLane.set(rule.lane, laneRules);
          }

          let output = `# Active Orchestration Rules (${rules.length} total)\n\n`;
          for (const [ruleLane, laneRules] of byLane.entries()) {
            const laneLabel = ruleLane === "hot" ? "Hot (High Priority)"
              : ruleLane === "orchestration" ? "Orchestration"
              : "Project-Specific";
            output += `## ${laneLabel}\n\n`;
            for (const rule of laneRules.sort((a, b) => b.confidence - a.confidence)) {
              output += `- ${rule.text}\n`;
            }
            output += "\n";
          }

          return {
            content: [{
              type: "text",
              text: output,
            }],
          };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          return {
            content: [{
              type: "text",
              text: `Error fetching orchestration rules: ${errorMsg}`,
            }],
          };
        }
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  });

  return server;
}

export async function runServer(config?: Partial<MemoryMcpConfig>) {
  const server = createMemoryMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
