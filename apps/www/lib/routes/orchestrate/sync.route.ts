/**
 * Orchestration Sync Routes
 *
 * Bi-directional sync endpoints for head agents:
 * - GET /v1/cmux/orchestration/:orchestrationId/sync - Pull state
 * - POST /v1/cmux/orchestration/:orchestrationId/sync - Push updates
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex, getConvexAdmin } from "@/lib/utils/get-convex";
import {
  extractTaskRunJwtFromRequest,
  verifyTaskRunJwt,
  type TaskRunJwtPayload,
} from "@/lib/utils/jwt-task-run";
import { api, internal } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

export const orchestrateSyncRouter = new OpenAPIHono();

type SyncAuthContext = {
  accessToken?: string;
  teamSlugOrId: string;
  jwtPayload?: TaskRunJwtPayload;
};

type SyncTaskRecord = {
  _id: string;
  prompt: string;
  assignedAgentName?: string | null;
  status: string;
  taskRunId?: string | null;
  dependencies?: string[];
  priority?: number;
  result?: string | null;
  errorMessage?: string | null;
  _creationTime: number;
  startedAt?: number;
  completedAt?: number;
  metadata?: unknown;
};

type InternalSyncMessageRecord = {
  messageId: string;
  senderName: string;
  recipientName?: string | null;
  messageType?: string | null;
  content: string;
  timestamp: string;
  read?: boolean;
};

async function resolveSyncAuthContext(
  request: Request
): Promise<
  | SyncAuthContext
  | {
      error: string;
      status: 401;
    }
> {
  const accessToken = await getAccessTokenFromRequest(request);
  if (accessToken) {
    const teamSlugOrId = new URL(request.url).searchParams.get("teamSlugOrId");
    if (!teamSlugOrId) {
      return { error: "Unauthorized - no team context", status: 401 };
    }
    return { accessToken, teamSlugOrId };
  }

  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const jwtToken = extractTaskRunJwtFromRequest(request) ?? bearerToken;

  if (!jwtToken) {
    return { error: "Unauthorized - no team context", status: 401 };
  }

  const jwtPayload = await verifyTaskRunJwt(jwtToken);
  if (!jwtPayload) {
    return { error: "Unauthorized - invalid JWT signature", status: 401 };
  }

  return {
    teamSlugOrId: jwtPayload.teamId,
    jwtPayload,
  };
}

// ============================================================================
// Schemas
// ============================================================================

const TurnStateSchema = z.object({
  turnNumber: z.number().openapi({ description: "Current turn number (increments on each drain)" }),
  awaitingOperatorInput: z.boolean().openapi({ description: "Whether agent is waiting for operator input" }),
  pendingInputs: z.number().openapi({ description: "Number of pending inputs in queue" }),
  queueCapacity: z.number().openapi({ description: "Maximum queue capacity" }),
}).openapi("TurnState");

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
    turnState: TurnStateSchema.optional().openapi({
      description: "Operator input queue state (for active-turn steering)",
    }),
  })
  .openapi("OrchestrationSyncResponse");

const OrchestrationPushTaskSchema = z
  .object({
    id: z.string().openapi({ description: "Local task ID from PLAN.json" }),
    status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
    result: z.string().optional(),
    errorMessage: z.string().optional(),
  })
  .openapi("OrchestrationPushTask");

const OrchestrationPushRequestSchema = z
  .object({
    orchestrationId: z.string().openapi({ description: "Orchestration session ID" }),
    headAgentStatus: z.enum(["running", "completed", "failed"]).optional().openapi({
      description: "Head agent's overall status (for heartbeat/completion signal)",
    }),
    tasks: z.array(OrchestrationPushTaskSchema).optional().openapi({
      description: "Task status updates to push to server",
    }),
    message: z.string().optional().openapi({
      description: "Optional status message from head agent",
    }),
  })
  .openapi("OrchestrationPushRequest");

const OrchestrationPushResponseSchema = z
  .object({
    success: z.boolean(),
    tasksUpdated: z.number(),
    heartbeatUpdated: z.boolean().optional(),
    message: z.string().optional(),
  })
  .openapi("OrchestrationPushResponse");

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/cmux/orchestration/:orchestrationId/sync
 * Sync endpoint for head agents to pull orchestration state.
 */
orchestrateSyncRouter.openapi(
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
    const auth = await resolveSyncAuthContext(c.req.raw);
    if ("error" in auth) {
      return c.text(auth.error, auth.status);
    }

    const convex = auth.accessToken
      ? getConvex({ accessToken: auth.accessToken })
      : null;
    const adminClient = !auth.accessToken ? getConvexAdmin() : null;

    if (!auth.accessToken && !adminClient) {
      return c.text("Server configuration error", 500);
    }

    try {
      const { orchestrationId } = c.req.valid("param");

      const tasks = (
        adminClient && auth.jwtPayload
          ? await adminClient.query(
              internal.orchestrationQueries.getOrchestrationStateInternal,
              {
                teamId: auth.jwtPayload.teamId,
                orchestrationId,
                taskRunId: undefined,
              }
            )
          : await convex!
              .query(api.orchestrationQueries.listTasksByTeam, {
                teamSlugOrId: auth.teamSlugOrId,
                limit: 100,
              })
              .then((allTasks) =>
                allTasks.filter((t) => {
                  const meta = t.metadata as { orchestrationId?: string } | undefined;
                  return meta?.orchestrationId === orchestrationId;
                })
              )
      ) as SyncTaskRecord[];

      if (tasks.length === 0) {
        return c.text("Orchestration not found", 404);
      }

      let messages: Array<{
        id: string;
        from: string;
        to: string;
        type?: "handoff" | "request" | "status";
        message: string;
        timestamp: string;
        read?: boolean;
      }> = [];

      if (auth.jwtPayload?.taskRunId && adminClient) {
        const rawMessages = (await adminClient.query(
          internal.orchestrationQueries.getMessagesForTaskRunInternal,
          {
            taskRunId: auth.jwtPayload.taskRunId as Id<"taskRuns">,
            includeRead: false,
          }
        )) as InternalSyncMessageRecord[];
        messages = rawMessages.map((m) => ({
          id: m.messageId,
          from: m.senderName,
          to: m.recipientName || "*",
          type: m.messageType as "handoff" | "request" | "status" | undefined,
          message: m.content,
          timestamp: m.timestamp,
          read: m.read,
        }));
      } else if (auth.jwtPayload?.taskRunId) {
        const rawMessages = await convex!.query(api.orchestrate.getMessages, {
          taskRunId: auth.jwtPayload.taskRunId as Id<"taskRuns">,
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

      const statusCounts = {
        total: tasks.length,
        completed: tasks.filter((t) => t.status === "completed").length,
        running: tasks.filter((t) => t.status === "running").length,
        failed: tasks.filter((t) => t.status === "failed").length,
        pending: tasks.filter((t) => t.status === "pending" || t.status === "assigned").length,
      };

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

      // Fetch operator input queue status for turn state
      let turnState: {
        turnNumber: number;
        awaitingOperatorInput: boolean;
        pendingInputs: number;
        queueCapacity: number;
      } | undefined;

      try {
        const queueStatus =
          adminClient && auth.jwtPayload
            ? await adminClient.query(
                internal.operatorInputQueue.getQueueStatusInternal,
                {
                  teamId: auth.jwtPayload.teamId,
                  orchestrationId,
                }
              )
            : await convex!.query(api.operatorInputQueue.getQueueStatus, {
                teamSlugOrId: auth.teamSlugOrId,
                orchestrationId,
              });
        // Turn number could be tracked in orchestration metadata; for now use 0
        // and let agents track their own turn count locally
        turnState = {
          turnNumber: 0, // TODO: Track in orchestration metadata
          awaitingOperatorInput: queueStatus.hasPendingInputs,
          pendingInputs: queueStatus.depth,
          queueCapacity: queueStatus.capacity,
        };
      } catch (queueErr) {
        // Queue status is optional; don't fail sync if unavailable
        console.warn("[orchestrate] Could not fetch queue status:", queueErr);
      }

      return c.json({
        tasks: syncTasks,
        messages,
        aggregatedStatus: statusCounts,
        turnState,
      });
    } catch (error) {
      console.error("[orchestrate] Failed to sync orchestration:", error);
      return c.text("Failed to sync orchestration", 500);
    }
  }
);

/**
 * POST /api/v1/cmux/orchestration/:orchestrationId/sync
 * Push endpoint for head agents to report status updates to the server.
 */
orchestrateSyncRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/v1/cmux/orchestration/{orchestrationId}/sync",
    tags: ["Orchestration"],
    summary: "Push orchestration updates",
    description:
      "Push orchestration task status updates from head agent to server. Used for heartbeats and task completion reporting.",
    request: {
      params: z.object({
        orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: OrchestrationPushRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: OrchestrationPushResponseSchema,
          },
        },
        description: "Push successful",
      },
      401: { description: "Unauthorized" },
      404: { description: "Orchestration not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const auth = await resolveSyncAuthContext(c.req.raw);
    if ("error" in auth) {
      return c.text(auth.error, auth.status);
    }

    const convex = auth.accessToken
      ? getConvex({ accessToken: auth.accessToken })
      : null;
    const adminClient = !auth.accessToken ? getConvexAdmin() : null;

    if (!auth.accessToken && !adminClient) {
      return c.text("Server configuration error", 500);
    }

    const { orchestrationId } = c.req.valid("param");
    const body = c.req.valid("json");

    if (body.orchestrationId && body.orchestrationId !== orchestrationId) {
      return c.text("Orchestration ID mismatch", 400);
    }

    try {
      let tasksUpdated = 0;

      if (body.tasks && body.tasks.length > 0) {
        const orchTasks = (
          adminClient && auth.jwtPayload
            ? await adminClient.query(
                internal.orchestrationQueries.getOrchestrationStateInternal,
                {
                  teamId: auth.jwtPayload.teamId,
                  orchestrationId,
                  taskRunId: undefined,
                }
              )
            : await convex!.query(api.orchestrationQueries.listTasksByTeam, {
                teamSlugOrId: auth.teamSlugOrId,
                limit: 100,
              }).then((allTasks) =>
                allTasks.filter((t) => {
                  const meta = t.metadata as { orchestrationId?: string; localTaskId?: string } | undefined;
                  return meta?.orchestrationId === orchestrationId;
                })
              )
        ) as SyncTaskRecord[];

        for (const pushTask of body.tasks) {
          const serverTask = orchTasks.find((t) => {
            const meta = t.metadata as { localTaskId?: string } | undefined;
            return meta?.localTaskId === pushTask.id;
          });

          if (serverTask) {
            if (pushTask.status === "completed") {
              if (adminClient) {
                await adminClient.mutation(
                  internal.orchestrationQueries.completeTaskInternal,
                  {
                    taskId: serverTask._id as Id<"orchestrationTasks">,
                    result: pushTask.result,
                  }
                );
              } else {
                await convex!.mutation(api.orchestrationQueries.completeTask, {
                  taskId: serverTask._id as Id<"orchestrationTasks">,
                  result: pushTask.result,
                });
              }
              tasksUpdated++;
            } else if (pushTask.status === "failed") {
              if (adminClient) {
                await adminClient.mutation(
                  internal.orchestrationQueries.failTaskInternal,
                  {
                    taskId: serverTask._id as Id<"orchestrationTasks">,
                    errorMessage: pushTask.errorMessage ?? "Task failed",
                  }
                );
              } else {
                await convex!.mutation(api.orchestrationQueries.failTask, {
                  taskId: serverTask._id as Id<"orchestrationTasks">,
                  errorMessage: pushTask.errorMessage ?? "Task failed",
                });
              }
              tasksUpdated++;
            }
          }
        }
      }

      let heartbeatUpdated = false;
      if (body.headAgentStatus) {
        try {
          if (adminClient && auth.jwtPayload) {
            await adminClient.mutation(
              internal.taskRuns.updateOrchestrationHeartbeatInternal,
              {
                teamId: auth.jwtPayload.teamId,
                id: auth.jwtPayload.taskRunId as Id<"taskRuns">,
                orchestrationId,
                status: body.headAgentStatus,
              }
            );
            console.log(`[orchestrate] Head agent heartbeat updated: ${body.headAgentStatus}`, {
              orchestrationId,
              taskRunId: auth.jwtPayload.taskRunId,
              userId: auth.jwtPayload.userId,
              message: body.message,
            });
            heartbeatUpdated = true;
          } else {
            const headAgentRun = await convex!.query(api.taskRuns.getByOrchestrationId, {
              orchestrationId,
              teamSlugOrId: auth.teamSlugOrId,
            });

            if (headAgentRun) {
              await convex!.mutation(api.taskRuns.updateOrchestrationHeartbeat, {
                teamSlugOrId: auth.teamSlugOrId,
                id: headAgentRun._id as Id<"taskRuns">,
                status: body.headAgentStatus,
              });
              console.log(`[orchestrate] Head agent heartbeat updated: ${body.headAgentStatus}`, {
                orchestrationId,
                taskRunId: headAgentRun._id,
                message: body.message,
              });
              heartbeatUpdated = true;
            } else {
              console.log(`[orchestrate] Head agent status update (no matching task run): ${body.headAgentStatus}`, {
                orchestrationId,
                message: body.message,
              });
            }
          }
        } catch (err) {
          console.error("[orchestrate] Failed to update head agent heartbeat:", err);
        }
      }

      return c.json({
        success: true,
        tasksUpdated,
        heartbeatUpdated,
        message: body.headAgentStatus
          ? `Head agent status: ${body.headAgentStatus}`
          : `Updated ${tasksUpdated} task(s)`,
      });
    } catch (error) {
      console.error("[orchestrate] Failed to push orchestration updates:", error);
      return c.text("Failed to push orchestration updates", 500);
    }
  }
);
