/**
 * Orchestration Events Routes
 *
 * Server-Sent Events endpoints for real-time orchestration updates:
 * - GET /orchestrate/events/:orchestrationId - SSE v1 (poll-based)
 * - GET /orchestrate/v2/events/:orchestrationId - SSE v2 (event-based)
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex, getConvexAdmin } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api, internal } from "@cmux/convex/api";
import { OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import type { AgentCommEvent } from "@cmux/shared";

export const orchestrateEventsRouter = new OpenAPIHono();

// ============================================================================
// SSE v1 - Poll-based events
// ============================================================================

/**
 * GET /api/orchestrate/events/:orchestrationId
 * Server-Sent Events endpoint for real-time orchestration updates.
 * Polls Convex every 3 seconds and sends events when status changes.
 */
orchestrateEventsRouter.get("/orchestrate/events/:orchestrationId", async (c) => {
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

    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        orchestrationId,
        timestamp: new Date().toISOString(),
      }),
    });

    while (isConnected) {
      try {
        const allTasks = await convex.query(api.orchestrationQueries.listTasksByTeam, {
          teamSlugOrId,
          limit: 100,
        });

        const tasks = allTasks.filter((t) => {
          const meta = t.metadata as { orchestrationId?: string } | undefined;
          return meta?.orchestrationId === orchestrationId;
        });

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

        const statusCounts = {
          total: tasks.length,
          completed: tasks.filter((t) => t.status === "completed").length,
          running: tasks.filter((t) => t.status === "running").length,
          failed: tasks.filter((t) => t.status === "failed").length,
          pending: tasks.filter((t) => t.status === "pending" || t.status === "assigned").length,
        };

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

        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({
            aggregatedStatus: statusCounts,
            timestamp: new Date().toISOString(),
          }),
        });

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
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  });
});

// ============================================================================
// SSE v2 - Event-based (reads from persisted events)
// ============================================================================

/**
 * GET /api/orchestrate/v2/events/:orchestrationId
 * Server-Sent Events endpoint for typed orchestration events.
 * Reads from persisted orchestrationEvents table for replay capability.
 */
orchestrateEventsRouter.get("/orchestrate/v2/events/:orchestrationId", async (c) => {
  const authHeader = c.req.header("Authorization");
  let accessToken = await getAccessTokenFromRequest(c.req.raw);
  let teamSlugOrId = c.req.query("teamSlugOrId");
  let jwtAuth = false;

  if (!accessToken && authHeader?.startsWith("Bearer ")) {
    const jwt = authHeader.slice(7);
    try {
      const parts = jwt.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf-8")
        );
        teamSlugOrId = payload.teamSlugOrId ?? payload.teamId;
        accessToken = jwt;
        jwtAuth = true;
      }
    } catch {
      return c.text("Invalid JWT", 401);
    }
  }

  if (!accessToken) {
    return c.text("Unauthorized", 401);
  }

  const orchestrationId = c.req.param("orchestrationId");
  const sinceTimestamp = c.req.query("since");
  const replayAll = c.req.query("replay") === "true";

  if (!teamSlugOrId) {
    return c.text("teamSlugOrId query parameter required", 400);
  }

  if (!jwtAuth) {
    try {
      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
    } catch {
      return c.text("Unauthorized", 401);
    }
  }

  const adminClient = jwtAuth ? getConvexAdmin() : null;
  const userClient = !jwtAuth ? getConvex({ accessToken }) : null;

  if (jwtAuth && !adminClient) {
    return c.text("Server configuration error: CONVEX_DEPLOY_KEY not set", 500);
  }

  interface OrchestrationEvent {
    eventId: string;
    orchestrationId: string;
    eventType: string;
    teamId: string;
    taskId?: string;
    taskRunId?: string;
    correlationId?: string;
    payload: unknown;
    createdAt: number;
  }

  async function fetchEvents(opts: {
    afterTimestamp?: number;
    limit: number;
  }): Promise<OrchestrationEvent[]> {
    if (jwtAuth && adminClient) {
      return adminClient.query(
        internal.orchestrationEvents.getByOrchestrationInternal,
        {
          teamId: teamSlugOrId!,
          orchestrationId,
          limit: opts.limit,
          afterTimestamp: opts.afterTimestamp,
        }
      ) as Promise<OrchestrationEvent[]>;
    } else if (userClient) {
      return userClient.query(
        api.orchestrationEvents.getByOrchestration,
        {
          teamSlugOrId: teamSlugOrId!,
          orchestrationId,
          limit: opts.limit,
          afterTimestamp: opts.afterTimestamp,
        }
      ) as unknown as Promise<OrchestrationEvent[]>;
    }
    return [];
  }

  return streamSSE(c, async (stream) => {
    let lastTimestamp = sinceTimestamp ? parseInt(sinceTimestamp, 10) : 0;
    let isConnected = true;

    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        orchestrationId,
        version: "v2",
        timestamp: new Date().toISOString(),
      }),
    });

    if (replayAll) {
      try {
        const historicalEvents = await fetchEvents({ limit: 500 });

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

    while (isConnected) {
      try {
        const newEvents = await fetchEvents({
          afterTimestamp: lastTimestamp,
          limit: 100,
        });

        for (const event of newEvents) {
          await stream.writeSSE({
            event: event.eventType,
            id: event.eventId,
            data: JSON.stringify(event.payload as AgentCommEvent),
          });
          lastTimestamp = Math.max(lastTimestamp, event.createdAt);
        }

        const completedEvent = newEvents.find(
          (e) => e.eventType === "orchestration_completed"
        );
        if (completedEvent) {
          isConnected = false;
          break;
        }

        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({
            lastTimestamp,
            newEventsCount: newEvents.length,
            timestamp: new Date().toISOString(),
          }),
        });

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
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  });
});
