import { describe, expect, it } from "bun:test";

// Type definitions matching the MCP server implementation
interface MailboxMessage {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  message: string;
  type: "handoff" | "request" | "status";
  read?: boolean;
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

// Helper functions matching MCP implementation
function generateTaskId(): string {
  return "task_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function generateMessageId(): string {
  return "msg_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function getTodayDateString(): string {
  const iso = new Date().toISOString();
  return iso.slice(0, iso.indexOf("T"));
}

describe("Task ID Generation", () => {
  it("generates unique task IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateTaskId());
    }
    expect(ids.size).toBe(100);
  });

  it("generates IDs with correct format", () => {
    const id = generateTaskId();
    expect(id).toMatch(/^task_[a-f0-9]{12}$/);
  });
});

describe("Message ID Generation", () => {
  it("generates unique message IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateMessageId());
    }
    expect(ids.size).toBe(100);
  });

  it("generates IDs with correct format", () => {
    const id = generateMessageId();
    expect(id).toMatch(/^msg_[a-f0-9]{12}$/);
  });
});

describe("Date String Generation", () => {
  it("returns ISO date format (YYYY-MM-DD)", () => {
    const date = getTodayDateString();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's date", () => {
    const date = getTodayDateString();
    const today = new Date().toISOString().slice(0, 10);
    expect(date).toBe(today);
  });
});

describe("TasksFile Structure", () => {
  it("creates valid empty tasks file", () => {
    const tasksFile: TasksFile = {
      version: 1,
      tasks: [],
    };
    expect(tasksFile.version).toBe(1);
    expect(tasksFile.tasks).toHaveLength(0);
  });

  it("creates valid tasks file with entries", () => {
    const tasksFile: TasksFile = {
      version: 1,
      tasks: [
        {
          id: "task_abc123def456",
          subject: "Fix authentication bug",
          description: "The login flow is broken",
          status: "pending",
          createdAt: "2026-03-18T10:00:00Z",
          updatedAt: "2026-03-18T10:00:00Z",
        },
      ],
      metadata: {
        sandboxId: "sandbox_xyz",
        createdAt: "2026-03-18T09:00:00Z",
      },
    };
    expect(tasksFile.tasks).toHaveLength(1);
    expect(tasksFile.tasks[0].status).toBe("pending");
  });

  it("validates task status enum", () => {
    const validStatuses: TaskEntry["status"][] = ["pending", "in_progress", "completed"];
    for (const status of validStatuses) {
      const task: TaskEntry = {
        id: "task_test",
        subject: "Test",
        description: "Test",
        status,
        createdAt: "2026-03-18T10:00:00Z",
        updatedAt: "2026-03-18T10:00:00Z",
      };
      expect(task.status).toBe(status);
    }
  });
});

describe("MailboxMessage Structure", () => {
  it("creates valid handoff message", () => {
    const msg: MailboxMessage = {
      id: "msg_abc123def456",
      timestamp: "2026-03-18T10:00:00Z",
      from: "claude/opus-4.5",
      to: "codex/gpt-5.1-codex-mini",
      message: "I've completed the API. Please write tests.",
      type: "handoff",
      read: false,
    };
    expect(msg.type).toBe("handoff");
    expect(msg.read).toBe(false);
  });

  it("creates valid request message", () => {
    const msg: MailboxMessage = {
      id: "msg_xyz789",
      timestamp: "2026-03-18T11:00:00Z",
      from: "claude/haiku-4.5",
      to: "claude/opus-4.5",
      message: "Can you review the auth flow?",
      type: "request",
    };
    expect(msg.type).toBe("request");
    expect(msg.read).toBeUndefined();
  });

  it("creates valid broadcast status message", () => {
    const msg: MailboxMessage = {
      id: "msg_broadcast",
      timestamp: "2026-03-18T12:00:00Z",
      from: "claude/opus-4.5",
      to: "*",
      message: "Starting work on authentication module",
      type: "status",
    };
    expect(msg.to).toBe("*");
    expect(msg.type).toBe("status");
  });

  it("validates message type enum", () => {
    const validTypes: MailboxMessage["type"][] = ["handoff", "request", "status"];
    for (const type of validTypes) {
      const msg: MailboxMessage = {
        id: "msg_test",
        timestamp: "2026-03-18T10:00:00Z",
        from: "agent-a",
        to: "agent-b",
        message: "test",
        type,
      };
      expect(msg.type).toBe(type);
    }
  });
});

describe("OrchestrationPlan Structure", () => {
  it("creates valid orchestration plan", () => {
    const plan: OrchestrationPlan = {
      version: 1,
      createdAt: "2026-03-18T10:00:00Z",
      updatedAt: "2026-03-18T10:00:00Z",
      status: "running",
      headAgent: "claude/opus-4.5",
      orchestrationId: "orch_abc123",
      description: "Multi-agent authentication refactor",
      tasks: [],
    };
    expect(plan.version).toBe(1);
    expect(plan.headAgent).toBe("claude/opus-4.5");
  });

  it("creates plan with tasks and dependencies", () => {
    const plan: OrchestrationPlan = {
      version: 1,
      createdAt: "2026-03-18T10:00:00Z",
      updatedAt: "2026-03-18T10:00:00Z",
      status: "running",
      headAgent: "claude/opus-4.5",
      orchestrationId: "orch_abc123",
      tasks: [
        {
          id: "task-1",
          prompt: "Implement API endpoints",
          agentName: "claude/sonnet-4.5",
          status: "completed",
          createdAt: "2026-03-18T10:00:00Z",
          completedAt: "2026-03-18T10:30:00Z",
          result: "API endpoints implemented",
        },
        {
          id: "task-2",
          prompt: "Write tests for API",
          agentName: "codex/gpt-5.1-codex-mini",
          status: "running",
          dependsOn: ["task-1"],
          createdAt: "2026-03-18T10:30:00Z",
          startedAt: "2026-03-18T10:31:00Z",
        },
      ],
    };
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[1].dependsOn).toContain("task-1");
  });
});

describe("OrchestrationEvent Structure", () => {
  it("creates task_started event", () => {
    const event: OrchestrationEvent = {
      timestamp: "2026-03-18T10:00:00Z",
      event: "task_started",
      taskRunId: "run_abc123",
      agentName: "claude/haiku-4.5",
      message: "Starting task execution",
    };
    expect(event.event).toBe("task_started");
  });

  it("creates task_completed event", () => {
    const event: OrchestrationEvent = {
      timestamp: "2026-03-18T10:30:00Z",
      event: "task_completed",
      taskRunId: "run_abc123",
      status: "completed",
      message: "Task finished successfully",
    };
    expect(event.event).toBe("task_completed");
    expect(event.status).toBe("completed");
  });

  it("creates message_sent event", () => {
    const event: OrchestrationEvent = {
      timestamp: "2026-03-18T11:00:00Z",
      event: "message_sent",
      from: "claude/opus-4.5",
      to: "codex/gpt-5.1-codex-mini",
      type: "handoff",
      message: "API complete, please write tests",
    };
    expect(event.event).toBe("message_sent");
    expect(event.type).toBe("handoff");
  });

  it("creates approval_required event", () => {
    const event: OrchestrationEvent = {
      timestamp: "2026-03-18T12:00:00Z",
      event: "approval_required",
      taskRunId: "run_xyz789",
      message: "Agent requesting permission to push",
      metadata: {
        action: "git push",
        target: "origin/main",
      },
    };
    expect(event.event).toBe("approval_required");
    expect(event.metadata?.action).toBe("git push");
  });
});

describe("Memory File Paths", () => {
  it("constructs correct knowledge path", () => {
    const memoryDir = "/root/lifecycle/memory";
    const knowledgePath = `${memoryDir}/knowledge/MEMORY.md`;
    expect(knowledgePath).toBe("/root/lifecycle/memory/knowledge/MEMORY.md");
  });

  it("constructs correct daily log path", () => {
    const memoryDir = "/root/lifecycle/memory";
    const date = "2026-03-18";
    const dailyPath = `${memoryDir}/daily/${date}.md`;
    expect(dailyPath).toBe("/root/lifecycle/memory/daily/2026-03-18.md");
  });

  it("constructs correct tasks path", () => {
    const memoryDir = "/root/lifecycle/memory";
    const tasksPath = `${memoryDir}/TASKS.json`;
    expect(tasksPath).toBe("/root/lifecycle/memory/TASKS.json");
  });

  it("constructs correct mailbox path", () => {
    const memoryDir = "/root/lifecycle/memory";
    const mailboxPath = `${memoryDir}/MAILBOX.json`;
    expect(mailboxPath).toBe("/root/lifecycle/memory/MAILBOX.json");
  });

  it("constructs correct orchestration paths", () => {
    const memoryDir = "/root/lifecycle/memory";
    const orchestrationDir = `${memoryDir}/orchestration`;

    expect(`${orchestrationDir}/PLAN.json`).toBe("/root/lifecycle/memory/orchestration/PLAN.json");
    expect(`${orchestrationDir}/AGENTS.json`).toBe("/root/lifecycle/memory/orchestration/AGENTS.json");
    expect(`${orchestrationDir}/EVENTS.jsonl`).toBe("/root/lifecycle/memory/orchestration/EVENTS.jsonl");
  });
});

describe("Agent Name Validation", () => {
  it("validates vendor/model format", () => {
    const validAgents = [
      "claude/opus-4.5",
      "claude/sonnet-4.5",
      "claude/haiku-4.5",
      "codex/gpt-5.1-codex-mini",
      "codex/gpt-5.4-xhigh",
      "gemini/gemini-2.5-pro",
      "opencode/big-pickle",
      "amp/amp-1.0",
    ];

    for (const agent of validAgents) {
      expect(agent.split("/")).toHaveLength(2);
      expect(agent.split("/")[0].length).toBeGreaterThan(0);
      expect(agent.split("/")[1].length).toBeGreaterThan(0);
    }
  });

  it("extracts vendor from agent name", () => {
    const agentName = "claude/opus-4.5";
    const vendor = agentName.split("/")[0];
    expect(vendor).toBe("claude");
  });

  it("extracts model from agent name", () => {
    const agentName = "claude/opus-4.5";
    const model = agentName.split("/")[1];
    expect(model).toBe("opus-4.5");
  });
});
