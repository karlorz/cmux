import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import type { AgentCommEvent } from "@cmux/shared";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Map known Convex/domain errors to appropriate HTTP status codes.
 * Returns null if the error is not a recognized domain error (caller should return 500).
 */
function mapDomainError(
  error: unknown,
): { status: 403 | 404; message: string } | null {
  if (!(error instanceof Error)) return null;
  const msg = error.message;
  if (msg.includes("Forbidden")) {
    return { status: 403, message: msg };
  }
  if (msg.includes("not found") || msg.includes("Not found")) {
    return { status: 404, message: msg };
  }
  return null;
}

// ============================================================================
// Schemas
// ============================================================================

const TaskStatusSchema = z
  .enum(["pending", "assigned", "running", "completed", "failed", "cancelled"])
  .openapi("TaskStatus");

const OrchestrationTaskSchema = z
  .object({
    _id: z.string().openapi({ description: "Task ID (Convex document ID)" }),
    prompt: z.string().openapi({ description: "Task prompt" }),
    status: TaskStatusSchema,
    priority: z.number().openapi({ description: "Task priority (lower = higher priority)" }),
    assignedAgentName: z.string().optional().openapi({ description: "Assigned agent name" }),
    assignedSandboxId: z.string().optional().openapi({ description: "Sandbox ID" }),
    createdAt: z.number().openapi({ description: "Creation timestamp" }),
    updatedAt: z.number().optional().openapi({ description: "Last update timestamp" }),
    startedAt: z.number().optional().openapi({ description: "Start timestamp" }),
    completedAt: z.number().optional().openapi({ description: "Completion timestamp" }),
    errorMessage: z.string().optional().openapi({ description: "Error message if failed" }),
    result: z.string().optional().openapi({ description: "Result if completed" }),
    dependencies: z.array(z.string()).optional().openapi({ description: "Dependency task IDs" }),
  })
  .openapi("OrchestrationTask");

const DependencyInfoSchema = z
  .object({
    totalDeps: z.number(),
    completedDeps: z.number(),
    pendingDeps: z.number(),
    blockedBy: z.array(
      z.object({
        _id: z.string(),
        status: z.string(),
        prompt: z.string(),
      })
    ),
  })
  .openapi("DependencyInfo");

const OrchestrationTaskWithDepsSchema = OrchestrationTaskSchema.extend({
  dependencyInfo: DependencyInfoSchema.optional(),
}).openapi("OrchestrationTaskWithDeps");

const OrchestrationSummarySchema = z
  .object({
    totalTasks: z.number().openapi({ description: "Total number of tasks" }),
    statusCounts: z.record(z.string(), z.number()).openapi({ description: "Count by status" }),
    activeAgentCount: z.number().openapi({ description: "Number of active agents" }),
    activeAgents: z.array(z.string()).openapi({ description: "List of active agent names" }),
    recentTasks: z.array(
      z.object({
        _id: z.string(),
        prompt: z.string(),
        status: z.string(),
        assignedAgentName: z.string().optional(),
        completedAt: z.number().optional(),
        errorMessage: z.string().optional(),
      })
    ).openapi({ description: "Recent completed/failed tasks" }),
  })
  .openapi("OrchestrationSummary");

const OrchestrateMessageRequestSchema = z
  .object({
    taskRunId: z
      .string()
      .regex(/^[a-z0-9]+$/, "Invalid task run ID format")
      .openapi({
        description: "Task run ID (Convex document ID)",
        example: "ns7xyz123abc",
      }),
    message: z.string().openapi({
      description: "Message content to send to the agent",
      example: "Fix the login bug",
    }),
    messageType: z
      .enum(["handoff", "request", "status"])
      .openapi({
        description:
          'Message type: handoff (transfer work), request (ask to do something), or status (progress update)',
        example: "request",
      }),
    teamSlugOrId: z.string().openapi({
      description: "Team slug or ID (for authorization)",
      example: "my-team",
    }),
  })
  .openapi("OrchestrateMessageRequest");

const OrchestrateMessageResponseSchema = z
  .object({
    ok: z.boolean().openapi({
      description: "Whether the message was successfully sent",
      example: true,
    }),
    message: z.string().optional().openapi({
      description: "Confirmation message",
      example: "Message sent to agent",
    }),
  })
  .openapi("OrchestrateMessageResponse");

export const orchestrateRouter = new OpenAPIHono();

/**
 * POST /api/orchestrate/message
 * Send a message to a running agent via the mailbox MCP.
 * The message is written to the agent's MAILBOX.json file.
 */
orchestrateRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/message",
    tags: ["Orchestration"],
    summary: "Send message to running agent",
    description:
      "Send a message to a running agent via the mailbox MCP. The message is written to MAILBOX.json in the sandbox.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: OrchestrateMessageRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: OrchestrateMessageResponseSchema,
          },
        },
        description: "Message sent successfully",
      },
      400: {
        description: "Invalid request",
      },
      401: {
        description: "Unauthorized",
      },
      404: {
        description: "Task run not found",
      },
      500: {
        description: "Server error",
      },
    },
  }),
  async (c) => {
    // Check authentication
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.text("Unauthorized", 401);
    }

    // Get validated request body from zod-openapi middleware
    // This automatically handles JSON parse errors and validation as 400s
    const { taskRunId, message, messageType, teamSlugOrId } = c.req.valid("json");

    // Verify user has access to this team
    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

    // Get Convex client
    const convex = getConvex({ accessToken });

    // Fetch task run to verify it exists and belongs to this team
    const taskRun = await convex.query(api.taskRuns.get, {
      id: taskRunId as Id<"taskRuns">,
      teamSlugOrId,
    });

    if (!taskRun) {
      return c.text("Task run not found", 404);
    }

    // Verify user owns this task run
    if (taskRun.userId !== user.id) {
      return c.text("Unauthorized", 401);
    }

    // Send message via mutation
    try {
      await convex.mutation(api.orchestrate.sendMessage, {
        taskRunId: taskRunId as Id<"taskRuns">,
        message,
        messageType,
        senderName: user.displayName || "user",
        timestamp: Date.now(),
      });

      return c.json(
        {
          ok: true,
          message: `Message sent to agent (type: ${messageType})`,
        },
        200
      );
    } catch (error) {
      console.error("[orchestrate] Failed to send message:", error);
      return c.text("Failed to send message", 500);
    }
  }
);

/**
 * GET /api/orchestrate/tasks
 * List orchestration tasks for a team with optional status filter.
 */
orchestrateRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/tasks",
    tags: ["Orchestration"],
    summary: "List orchestration tasks",
    description: "List orchestration tasks for a team with optional status filter and dependency info.",
    request: {
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
        status: TaskStatusSchema.optional().openapi({ description: "Filter by status" }),
        limit: z.coerce.number().optional().openapi({ description: "Maximum number of tasks to return" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(OrchestrationTaskWithDepsSchema),
          },
        },
        description: "Tasks retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId, status, limit } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const tasks = await convex.query(api.orchestrationQueries.listTasksWithDependencyInfo, {
        teamSlugOrId,
        status,
        limit,
      });

      return c.json(tasks);
    } catch (error) {
      console.error("[orchestrate] Failed to list tasks:", error);
      return c.text("Failed to list tasks", 500);
    }
  }
);

/**
 * GET /api/orchestrate/tasks/:taskId
 * Get a single orchestration task by ID.
 */
orchestrateRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/tasks/{taskId}",
    tags: ["Orchestration"],
    summary: "Get orchestration task",
    description: "Get a single orchestration task by ID.",
    request: {
      params: z.object({
        taskId: z.string().openapi({ description: "Orchestration task ID" }),
      }),
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: OrchestrationTaskSchema,
          },
        },
        description: "Task retrieved successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden: task does not belong to this team" },
      404: { description: "Task not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { taskId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const task = await convex.query(api.orchestrationQueries.getTask, {
        taskId: taskId as Id<"orchestrationTasks">,
        teamSlugOrId,
      });

      if (!task) {
        return c.text("Task not found", 404);
      }

      return c.json(task);
    } catch (error) {
      console.error("[orchestrate] Failed to get task:", error);
      const mapped = mapDomainError(error);
      if (mapped) return c.text(mapped.message, mapped.status);
      return c.text("Failed to get task", 500);
    }
  }
);

/**
 * POST /api/orchestrate/tasks/:taskId/cancel
 * Cancel an orchestration task.
 */
orchestrateRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/tasks/{taskId}/cancel",
    tags: ["Orchestration"],
    summary: "Cancel orchestration task",
    description: "Cancel an orchestration task. Optionally cascade to dependent tasks.",
    request: {
      params: z.object({
        taskId: z.string().openapi({ description: "Orchestration task ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
              cascade: z.boolean().optional().openapi({ description: "Also cancel dependent tasks" }),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              cancelledCount: z.number(),
            }),
          },
        },
        description: "Task cancelled successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { taskId } = c.req.valid("param");
    const { teamSlugOrId, cascade } = c.req.valid("json");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      // Cancel the main task
      await convex.mutation(api.orchestrationQueries.cancelTask, {
        taskId: taskId as Id<"orchestrationTasks">,
      });

      let cancelledCount = 1;

      // Optionally cascade to dependents (in parallel for efficiency)
      if (cascade) {
        const dependents = await convex.query(api.orchestrationQueries.getDependentTasks, {
          taskId: taskId as Id<"orchestrationTasks">,
        });

        const cancellable = dependents.filter(
          (d) => d && (d.status === "pending" || d.status === "assigned")
        );

        await Promise.all(
          cancellable.map((d) =>
            convex.mutation(api.orchestrationQueries.cancelTask, { taskId: d._id })
          )
        );
        cancelledCount += cancellable.length;
      }

      return c.json({ ok: true, cancelledCount });
    } catch (error) {
      console.error("[orchestrate] Failed to cancel task:", error);
      const mapped = mapDomainError(error);
      if (mapped) return c.text(mapped.message, mapped.status);
      return c.text("Failed to cancel task", 500);
    }
  }
);

/**
 * GET /api/orchestrate/metrics
 * Get orchestration summary metrics for a team.
 */
orchestrateRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/metrics",
    tags: ["Orchestration"],
    summary: "Get orchestration metrics",
    description: "Get orchestration summary metrics including task counts by status and active agents.",
    request: {
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: OrchestrationSummarySchema,
          },
        },
        description: "Metrics retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const summary = await convex.query(api.orchestrationQueries.getOrchestrationSummary, {
        teamSlugOrId,
      });

      return c.json(summary);
    } catch (error) {
      console.error("[orchestrate] Failed to get metrics:", error);
      return c.text("Failed to get metrics", 500);
    }
  }
);

// ============================================================================
// Orchestration Sync Endpoint (for head agent bi-directional sync)
// ============================================================================

const OrchestrationSyncResponseSchema = z
  .object({
    tasks: z.array(
      z.object({
        id: z.string(),
        prompt: z.string(),
        agentName: z.string(),
        status: z.string(),
        taskRunId: z.string().optional(),
        dependsOn: z.array(z.string()).optional(),
        priority: z.number().optional(),
        result: z.string().optional(),
        errorMessage: z.string().optional(),
        createdAt: z.string(),
        startedAt: z.string().optional(),
        completedAt: z.string().optional(),
      })
    ),
    messages: z.array(
      z.object({
        id: z.string(),
        from: z.string(),
        to: z.string(),
        type: z.enum(["handoff", "request", "status"]).optional(),
        message: z.string(),
        timestamp: z.string(),
        read: z.boolean().optional(),
      })
    ),
    aggregatedStatus: z.object({
      total: z.number(),
      completed: z.number(),
      running: z.number(),
      failed: z.number(),
      pending: z.number(),
    }),
  })
  .openapi("OrchestrationSyncResponse");

/**
 * GET /api/v1/cmux/orchestration/:orchestrationId/sync
 * Sync endpoint for head agents to pull orchestration state.
 * Supports JWT auth from CMUX_TASK_RUN_JWT for agent-to-server communication.
 */
orchestrateRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/v1/cmux/orchestration/{orchestrationId}/sync",
    tags: ["Orchestration"],
    summary: "Sync orchestration state",
    description:
      "Pull latest orchestration state for head agents. Returns tasks, messages, and aggregated status. Supports JWT auth via Authorization header.",
    request: {
      params: z.object({
        orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: OrchestrationSyncResponseSchema,
          },
        },
        description: "Orchestration state retrieved successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Orchestration not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    // Support both OAuth token and JWT auth
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);

    // Try to get team access from JWT if no OAuth token
    let teamSlugOrId: string | undefined;
    let taskRunId: string | undefined;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      // Parse JWT to extract team and task run info
      // For now, we'll require the JWT to be valid and extract info from it
      // The JWT contains the taskRunId which we can use to look up the team
      const jwt = authHeader.slice(7);
      try {
        // Decode JWT payload (base64url) - this is a simple decode, not verification
        // Real verification happens in the Convex action
        const parts = jwt.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf-8")
          );
          taskRunId = payload.taskRunId;
          teamSlugOrId = payload.teamSlugOrId;
        }
      } catch {
        return c.text("Invalid JWT", 401);
      }
    } else if (accessToken) {
      // OAuth token - get team from query params or use default
      const queryParams = c.req.query();
      teamSlugOrId = queryParams.teamSlugOrId;
    }

    if (!teamSlugOrId) {
      return c.text("Unauthorized - no team context", 401);
    }

    const { orchestrationId } = c.req.valid("param");

    try {
      // Use admin client for JWT auth, regular client for OAuth
      // For JWT-based calls, require OAuth token (JWT auth is for sandbox-to-server only)
      if (!accessToken) {
        return c.text("Unauthorized - OAuth token required", 401);
      }
      const convex = getConvex({ accessToken });

      // Get orchestration tasks for this orchestrationId
      const allTasks = await convex.query(api.orchestrationQueries.listTasksByTeam, {
        teamSlugOrId,
        limit: 100,
      });

      // Filter tasks by orchestrationId (stored in metadata)
      const tasks = allTasks.filter((t) => {
        const meta = t.metadata as { orchestrationId?: string } | undefined;
        return meta?.orchestrationId === orchestrationId;
      });

      if (tasks.length === 0) {
        return c.text("Orchestration not found", 404);
      }

      // Get messages for the head agent's task run
      let messages: Array<{
        id: string;
        from: string;
        to: string;
        type?: "handoff" | "request" | "status";
        message: string;
        timestamp: string;
        read?: boolean;
      }> = [];

      if (taskRunId) {
        const rawMessages = await convex.query(api.orchestrate.getMessages, {
          taskRunId: taskRunId as Id<"taskRuns">,
          includeRead: false,
        });
        messages = rawMessages.map((m) => ({
          id: m.id,
          from: m.from,
          to: m.to ?? "*",
          type: m.type as "handoff" | "request" | "status" | undefined,
          message: m.message,
          timestamp: m.timestamp,
          read: m.read,
        }));
      }

      // Calculate aggregated status
      const statusCounts = {
        total: tasks.length,
        completed: tasks.filter((t) => t.status === "completed").length,
        running: tasks.filter((t) => t.status === "running").length,
        failed: tasks.filter((t) => t.status === "failed").length,
        pending: tasks.filter((t) => t.status === "pending" || t.status === "assigned").length,
      };

      // Transform tasks to sync format
      const syncTasks = tasks.map((t) => ({
        id: t._id,
        prompt: t.prompt,
        agentName: t.assignedAgentName ?? "unassigned",
        status: t.status,
        taskRunId: t.taskRunId ?? undefined,
        dependsOn: t.dependencies ?? undefined,
        priority: t.priority,
        result: t.result ?? undefined,
        errorMessage: t.errorMessage ?? undefined,
        createdAt: new Date(t._creationTime).toISOString(),
        startedAt: t.startedAt ? new Date(t.startedAt).toISOString() : undefined,
        completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : undefined,
      }));

      return c.json({
        tasks: syncTasks,
        messages,
        aggregatedStatus: statusCounts,
      });
    } catch (error) {
      console.error("[orchestrate] Failed to sync orchestration:", error);
      return c.text("Failed to sync orchestration", 500);
    }
  }
);

// ============================================================================
// Orchestration Events SSE Endpoint (for real-time watch mode)
// ============================================================================

/**
 * GET /api/orchestrate/events/:orchestrationId
 * Server-Sent Events endpoint for real-time orchestration updates.
 * Polls Convex every 3 seconds and sends events when status changes.
 */
orchestrateRouter.get("/orchestrate/events/:orchestrationId", async (c) => {
  const accessToken = await getAccessTokenFromRequest(c.req.raw);
  if (!accessToken) {
    return c.text("Unauthorized", 401);
  }

  const orchestrationId = c.req.param("orchestrationId");
  const teamSlugOrId = c.req.query("teamSlugOrId");

  if (!teamSlugOrId) {
    return c.text("teamSlugOrId query parameter required", 400);
  }

  try {
    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
  } catch {
    return c.text("Unauthorized", 401);
  }

  const convex = getConvex({ accessToken });

  return streamSSE(c, async (stream) => {
    const lastStatusMap = new Map<string, string>();
    let isConnected = true;

    // Send connected event
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        orchestrationId,
        timestamp: new Date().toISOString(),
      }),
    });

    // Poll for updates
    while (isConnected) {
      try {
        const allTasks = await convex.query(api.orchestrationQueries.listTasksByTeam, {
          teamSlugOrId,
          limit: 100,
        });

        // Filter tasks by orchestrationId
        const tasks = allTasks.filter((t) => {
          const meta = t.metadata as { orchestrationId?: string } | undefined;
          return meta?.orchestrationId === orchestrationId;
        });

        // Check for status changes
        for (const task of tasks) {
          const prevStatus = lastStatusMap.get(task._id);
          if (prevStatus !== task.status) {
            await stream.writeSSE({
              event: "task_status",
              data: JSON.stringify({
                taskId: task._id,
                status: task.status,
                previousStatus: prevStatus ?? null,
                prompt: task.prompt,
                agentName: task.assignedAgentName ?? null,
                result: task.result ?? null,
                errorMessage: task.errorMessage ?? null,
                timestamp: new Date().toISOString(),
              }),
            });
            lastStatusMap.set(task._id, task.status);

            // Send task_completed event for terminal states
            if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
              await stream.writeSSE({
                event: "task_completed",
                data: JSON.stringify({
                  taskId: task._id,
                  status: task.status,
                  result: task.result ?? null,
                  errorMessage: task.errorMessage ?? null,
                  timestamp: new Date().toISOString(),
                }),
              });
            }
          }
        }

        // Calculate aggregated status
        const statusCounts = {
          total: tasks.length,
          completed: tasks.filter((t) => t.status === "completed").length,
          running: tasks.filter((t) => t.status === "running").length,
          failed: tasks.filter((t) => t.status === "failed").length,
          pending: tasks.filter((t) => t.status === "pending" || t.status === "assigned").length,
        };

        // Check if all tasks are in terminal state
        const allTerminal = tasks.length > 0 &&
          tasks.every((t) => t.status === "completed" || t.status === "failed" || t.status === "cancelled");

        if (allTerminal) {
          await stream.writeSSE({
            event: "orchestration_completed",
            data: JSON.stringify({
              orchestrationId,
              aggregatedStatus: statusCounts,
              timestamp: new Date().toISOString(),
            }),
          });
          isConnected = false;
          break;
        }

        // Send heartbeat
        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({
            aggregatedStatus: statusCounts,
            timestamp: new Date().toISOString(),
          }),
        });

        // Wait 3 seconds before next poll
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (error) {
        console.error("[orchestrate] SSE poll error:", error);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            message: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
          }),
        });
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  });
});

// ============================================================================
// Typed Orchestration Events SSE Endpoint (v2 - reads from persisted events)
// ============================================================================

/**
 * GET /api/orchestrate/v2/events/:orchestrationId
 * Server-Sent Events endpoint for typed orchestration events.
 * Reads from persisted orchestrationEvents table for replay capability.
 * Events are emitted in AgentCommEvent format.
 */
orchestrateRouter.get("/orchestrate/v2/events/:orchestrationId", async (c) => {
  const accessToken = await getAccessTokenFromRequest(c.req.raw);
  if (!accessToken) {
    return c.text("Unauthorized", 401);
  }

  const orchestrationId = c.req.param("orchestrationId");
  const teamSlugOrId = c.req.query("teamSlugOrId");
  const sinceTimestamp = c.req.query("since");
  const replayAll = c.req.query("replay") === "true";

  if (!teamSlugOrId) {
    return c.text("teamSlugOrId query parameter required", 400);
  }

  try {
    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
  } catch {
    return c.text("Unauthorized", 401);
  }

  const convex = getConvex({ accessToken });

  return streamSSE(c, async (stream) => {
    let lastTimestamp = sinceTimestamp ? parseInt(sinceTimestamp, 10) : 0;
    let isConnected = true;

    // Send connected event
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        orchestrationId,
        version: "v2",
        timestamp: new Date().toISOString(),
      }),
    });

    // If replay requested, fetch all historical events first
    if (replayAll) {
      try {
        const historicalEvents = await convex.query(
          api.orchestrationEvents.getByOrchestration,
          {
            teamSlugOrId,
            orchestrationId,
            limit: 500,
          }
        );

        for (const event of historicalEvents) {
          await stream.writeSSE({
            event: event.eventType,
            id: event.eventId,
            data: JSON.stringify(event.payload as AgentCommEvent),
          });
          lastTimestamp = Math.max(lastTimestamp, event.createdAt);
        }

        await stream.writeSSE({
          event: "replay_complete",
          data: JSON.stringify({
            eventsReplayed: historicalEvents.length,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (error) {
        console.error("[orchestrate/v2] Replay error:", error);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            message: "Failed to replay events",
            timestamp: new Date().toISOString(),
          }),
        });
      }
    }

    // Poll for new events
    while (isConnected) {
      try {
        // Fetch new events since last timestamp
        const newEvents = await convex.query(
          api.orchestrationEvents.getByOrchestration,
          {
            teamSlugOrId,
            orchestrationId,
            afterTimestamp: lastTimestamp,
            limit: 100,
          }
        );

        // Emit new events
        for (const event of newEvents) {
          await stream.writeSSE({
            event: event.eventType,
            id: event.eventId,
            data: JSON.stringify(event.payload as AgentCommEvent),
          });
          lastTimestamp = Math.max(lastTimestamp, event.createdAt);
        }

        // Check for orchestration_completed event
        const completedEvent = newEvents.find(
          (e) => e.eventType === "orchestration_completed"
        );
        if (completedEvent) {
          isConnected = false;
          break;
        }

        // Send heartbeat with current state
        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({
            lastTimestamp,
            newEventsCount: newEvents.length,
            timestamp: new Date().toISOString(),
          }),
        });

        // Wait 2 seconds before next poll (faster than v1 since events are pre-computed)
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("[orchestrate/v2] SSE poll error:", error);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            message: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
          }),
        });
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  });
});

// ============================================================================
// Approval Broker Endpoints (for human-in-the-loop orchestration)
// ============================================================================

const ApprovalRequestSchema = z
  .object({
    requestId: z.string().openapi({ description: "Approval request ID (apr_xxx format)" }),
    orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
    taskId: z.string().optional().openapi({ description: "Task ID (if linked)" }),
    source: z.enum(["tool_use", "head_agent", "worker_agent", "policy", "system"]).openapi({
      description: "Source of the approval request",
    }),
    approvalType: z.enum([
      "tool_permission",
      "review_request",
      "deployment",
      "cost_override",
      "escalation",
      "risky_action",
    ]).openapi({ description: "Type of approval" }),
    action: z.string().openapi({ description: "Action being requested" }),
    context: z.object({
      agentName: z.string(),
      filePath: z.string().optional(),
      command: z.string().optional(),
      reasoning: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high"]).optional(),
    }).openapi({ description: "Context for the approval" }),
    status: z.enum(["pending", "approved", "denied", "expired", "cancelled"]).openapi({
      description: "Current status",
    }),
    expiresAt: z.number().optional().openapi({ description: "Expiration timestamp" }),
    createdAt: z.number().openapi({ description: "Creation timestamp" }),
  })
  .openapi("ApprovalRequest");

/**
 * GET /api/orchestrate/approvals/:orchestrationId/pending
 * Get pending approval requests for an orchestration.
 */
orchestrateRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/approvals/{orchestrationId}/pending",
    tags: ["Orchestration", "Approvals"],
    summary: "Get pending approvals",
    description: "Get pending approval requests for an orchestration. Used by head agents to check for human input needed.",
    request: {
      params: z.object({
        orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
      }),
      query: z.object({
        teamSlugOrId: z.string().optional().openapi({ description: "Team slug or ID (extracted from JWT if not provided)" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(ApprovalRequestSchema),
          },
        },
        description: "Pending approvals retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    // Support both OAuth token and JWT auth
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);

    let teamSlugOrId: string | undefined = c.req.valid("query").teamSlugOrId;

    // Extract team from JWT if no OAuth token
    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      const jwt = authHeader.slice(7);
      try {
        const parts = jwt.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf-8")
          );
          teamSlugOrId = teamSlugOrId ?? payload.teamSlugOrId;
        }
      } catch {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("teamSlugOrId required", 400);
    }

    const { orchestrationId } = c.req.valid("param");

    try {
      // For JWT auth, we need to use an admin client or validate differently
      // For now, require OAuth token for this endpoint
      if (!accessToken) {
        return c.text("OAuth token required", 401);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const approvals = await convex.query(api.approvalBroker.getPendingByOrchestration, {
        teamSlugOrId,
        orchestrationId,
      });

      return c.json(approvals);
    } catch (error) {
      console.error("[orchestrate] Failed to get pending approvals:", error);
      return c.text("Failed to get pending approvals", 500);
    }
  }
);

/**
 * POST /api/orchestrate/approvals/:requestId/resolve
 * Resolve an approval request (approve or deny).
 */
orchestrateRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/approvals/{requestId}/resolve",
    tags: ["Orchestration", "Approvals"],
    summary: "Resolve approval request",
    description: "Resolve a pending approval request. Allows approve/deny with various granularities.",
    request: {
      params: z.object({
        requestId: z.string().openapi({ description: "Approval request ID (apr_xxx format)" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string().optional().openapi({ description: "Team slug or ID" }),
              resolution: z.enum(["allow", "allow_once", "allow_session", "deny", "deny_always"]).openapi({
                description: "Resolution decision",
              }),
              note: z.string().optional().openapi({ description: "Optional note explaining the decision" }),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              status: z.string(),
            }),
          },
        },
        description: "Approval resolved successfully",
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      404: { description: "Approval request not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { requestId } = c.req.valid("param");
    const { teamSlugOrId, resolution, note } = c.req.valid("json");

    if (!teamSlugOrId) {
      return c.text("teamSlugOrId required", 400);
    }

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const result = await convex.mutation(api.approvalBroker.resolveRequest, {
        teamSlugOrId,
        requestId,
        resolution,
        note,
      });

      return c.json(result);
    } catch (error) {
      console.error("[orchestrate] Failed to resolve approval:", error);
      const mapped = mapDomainError(error);
      if (mapped) return c.text(mapped.message, mapped.status);
      return c.text("Failed to resolve approval", 500);
    }
  }
);

/**
 * GET /api/orchestrate/approvals/team/:teamSlugOrId
 * Get all pending approvals for a team (dashboard view).
 */
orchestrateRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/approvals/team/{teamSlugOrId}",
    tags: ["Orchestration", "Approvals"],
    summary: "Get team pending approvals",
    description: "Get all pending approval requests for a team. Used by dashboard to show all approvals needing attention.",
    request: {
      params: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
      }),
      query: z.object({
        limit: z.coerce.number().optional().openapi({ description: "Maximum number of approvals to return" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(ApprovalRequestSchema),
          },
        },
        description: "Pending approvals retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { teamSlugOrId } = c.req.valid("param");
    const { limit } = c.req.valid("query");

    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const approvals = await convex.query(api.approvalBroker.getPendingByTeam, {
        teamSlugOrId,
        limit,
      });

      return c.json(approvals);
    } catch (error) {
      console.error("[orchestrate] Failed to get team approvals:", error);
      return c.text("Failed to get team approvals", 500);
    }
  }
);

// ============================================================================
// Orchestration Learning Routes
// ============================================================================

const LogLearningRequestSchema = z.object({
  eventType: z.enum(["learning_logged", "error_logged", "feature_request_logged"]),
  text: z.string().min(1),
  lane: z.enum(["hot", "orchestration", "project"]).default("orchestration"),
  confidence: z.number().min(0).max(1).default(0.5),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const LogLearningResponseSchema = z.object({
  eventId: z.string(),
  ruleId: z.string().optional(),
  message: z.string(),
});

/**
 * POST /api/v1/cmux/orchestration/learning/log
 * Log an orchestration learning, error, or feature request.
 * Requires JWT auth (from sandbox agent).
 */
orchestrateRouter.openapi(
  createRoute({
    method: "post",
    path: "/learning/log",
    tags: ["orchestration-learning"],
    summary: "Log an orchestration learning event",
    description:
      "Log a learning, error, or feature request that may be promoted to an orchestration rule",
    request: {
      body: {
        content: {
          "application/json": {
            schema: LogLearningRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Learning logged successfully",
        content: {
          "application/json": {
            schema: LogLearningResponseSchema,
          },
        },
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const body = c.req.valid("json");

    try {
      const convex = getConvex({ accessToken });

      // Decode JWT to get teamSlugOrId and taskRunId
      const user = await getUserFromRequest(c.req.raw);
      if (!user) {
        return c.text("Unauthorized", 401);
      }

      // Extract team context from JWT claims or user context
      const jwtPayload = JSON.parse(
        Buffer.from(accessToken.split(".")[1], "base64").toString()
      );
      const teamSlugOrId = jwtPayload.teamSlugOrId ?? jwtPayload.team_id;
      const taskRunId = jwtPayload.taskRunId;

      if (!teamSlugOrId) {
        return c.text("Missing team context in JWT", 400);
      }

      // Log the event
      const result = await convex.mutation(api.agentOrchestrationLearning.logEvent, {
        teamSlugOrId,
        eventType: body.eventType,
        payload: {
          text: body.text,
          lane: body.lane,
          confidence: body.confidence,
          metadata: body.metadata,
          sourceTaskRunId: taskRunId,
        },
      });

      return c.json({
        eventId: result.eventId,
        ruleId: result.ruleId,
        message: "Learning logged successfully",
      });
    } catch (error) {
      console.error("[orchestrate] Failed to log learning:", error);
      return c.text("Failed to log learning", 500);
    }
  }
);

const GetRulesQuerySchema = z.object({
  lane: z.enum(["hot", "orchestration", "project"]).optional(),
});

const OrchestrationRuleSchema = z.object({
  _id: z.string(),
  text: z.string(),
  lane: z.enum(["hot", "orchestration", "project"]),
  confidence: z.number(),
  projectFullName: z.string().optional(),
});

const GetRulesResponseSchema = z.object({
  rules: z.array(OrchestrationRuleSchema),
});

/**
 * GET /api/v1/cmux/orchestration/rules
 * Get active orchestration rules for the team.
 * Requires JWT auth (from sandbox agent).
 */
orchestrateRouter.openapi(
  createRoute({
    method: "get",
    path: "/rules",
    tags: ["orchestration-learning"],
    summary: "Get active orchestration rules",
    description: "Fetch active orchestration rules for the team that are injected into agent prompts",
    request: {
      query: GetRulesQuerySchema,
    },
    responses: {
      200: {
        description: "Rules fetched successfully",
        content: {
          "application/json": {
            schema: GetRulesResponseSchema,
          },
        },
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { lane } = c.req.valid("query");

    try {
      const convex = getConvex({ accessToken });

      // Extract team context from JWT
      const jwtPayload = JSON.parse(
        Buffer.from(accessToken.split(".")[1], "base64").toString()
      );
      const teamSlugOrId = jwtPayload.teamSlugOrId ?? jwtPayload.team_id;

      if (!teamSlugOrId) {
        return c.text("Missing team context in JWT", 400);
      }

      const rules = await convex.query(api.agentOrchestrationLearning.getActiveRules, {
        teamSlugOrId,
        lane,
      });

      return c.json({
        rules: rules.map((r) => ({
          _id: r._id,
          text: r.text,
          lane: r.lane,
          confidence: r.confidence,
          projectFullName: r.projectFullName,
        })),
      });
    } catch (error) {
      console.error("[orchestrate] Failed to get orchestration rules:", error);
      return c.text("Failed to get orchestration rules", 500);
    }
  }
);
