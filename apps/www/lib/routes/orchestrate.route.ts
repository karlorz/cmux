import {
  getAccessTokenFromRequest,
  getUserFromRequest,
} from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

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

      // Optionally cascade to dependents
      if (cascade) {
        const dependents = await convex.query(api.orchestrationQueries.getDependentTasks, {
          taskId: taskId as Id<"orchestrationTasks">,
        });

        for (const dependent of dependents) {
          if (!dependent) continue;
          if (dependent.status === "pending" || dependent.status === "assigned") {
            await convex.mutation(api.orchestrationQueries.cancelTask, {
              taskId: dependent._id,
            });
            cancelledCount++;
          }
        }
      }

      return c.json({ ok: true, cancelledCount });
    } catch (error) {
      console.error("[orchestrate] Failed to cancel task:", error);
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
