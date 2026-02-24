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

export interface MemoryMcpConfig {
  memoryDir: string;
  agentName?: string;
}

const DEFAULT_MEMORY_DIR = "/root/lifecycle/memory";

export function createMemoryMcpServer(config?: Partial<MemoryMcpConfig>) {
  const memoryDir = config?.memoryDir ?? DEFAULT_MEMORY_DIR;
  const agentName = config?.agentName ?? process.env.CMUX_AGENT_NAME ?? "external-client";

  const knowledgeDir = path.join(memoryDir, "knowledge");
  const dailyDir = path.join(memoryDir, "daily");
  const mailboxPath = path.join(memoryDir, "MAILBOX.json");
  const tasksPath = path.join(memoryDir, "TASKS.json");

  // Helper functions
  function readFile(filePath: string): string | null {
    try {
      if (!fs.existsSync(filePath)) return null;
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
    type?: "handoff" | "request" | "status";
    message: string;
    timestamp: string;
    read?: boolean;
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
      name: "cmux-memory",
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
        description: 'Read a memory file. Type can be "knowledge", "tasks", or "mailbox".',
        inputSchema: {
          type: "object" as const,
          properties: {
            type: {
              type: "string",
              enum: ["knowledge", "tasks", "mailbox"],
              description: "The type of memory to read",
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
        name: "send_message",
        description: 'Send a message to another agent on the same task. Use "*" to broadcast to all agents.',
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
              enum: ["handoff", "request", "status"],
              description: "Message type: handoff (work transfer), request (ask to do something), status (progress update)",
            },
          },
          required: ["to", "message"],
        },
      },
      {
        name: "get_my_messages",
        description: "Get all messages addressed to this agent (including broadcasts). Returns unread messages first.",
        inputSchema: {
          type: "object" as const,
          properties: {
            includeRead: {
              type: "boolean",
              description: "Include messages already marked as read (default: false)",
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
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_memory": {
        const type = (args as { type: string }).type;
        let content: string | null = null;
        if (type === "knowledge") {
          content = readFile(path.join(knowledgeDir, "MEMORY.md"));
        } else if (type === "tasks") {
          content = readFile(tasksPath);
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

      case "send_message": {
        const { to, message, type } = args as { to: string; message: string; type?: "handoff" | "request" | "status" };
        const mailbox = readMailbox();
        const newMessage: MailboxMessage = {
          id: generateMessageId(),
          from: agentName,
          to,
          type: type ?? "request",
          message,
          timestamp: new Date().toISOString(),
          read: false,
        };
        mailbox.messages.push(newMessage);
        writeMailbox(mailbox);
        return { content: [{ type: "text", text: `Message sent successfully. ID: ${newMessage.id}` }] };
      }

      case "get_my_messages": {
        const includeRead = (args as { includeRead?: boolean }).includeRead ?? false;
        const mailbox = readMailbox();
        const myMessages = mailbox.messages.filter(
          (m) => m.to === agentName || m.to === "*"
        );
        const filtered = includeRead ? myMessages : myMessages.filter((m) => !m.read);
        if (filtered.length === 0) {
          return { content: [{ type: "text", text: "No messages for you." }] };
        }
        const formatted = filtered
          .map((m) => `[${m.id}] ${m.type ?? "message"} from ${m.from}: ${m.message}`)
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
