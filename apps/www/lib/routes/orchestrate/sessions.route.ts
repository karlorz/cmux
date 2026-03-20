/**
 * Orchestration Sessions Routes
 *
 * Provider session binding endpoints:
 * - POST /v1/cmux/orchestration/sessions/bind - Bind provider session
 * - GET /v1/cmux/orchestration/sessions/:taskId - Get session binding
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvexAdmin } from "@/lib/utils/get-convex";
import { internal } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { extractTeamFromJwt, extractTaskRunIdFromJwt } from "./_helpers";

export const orchestrateSessionsRouter = new OpenAPIHono();

// ============================================================================
// Schemas
// ============================================================================

const BindSessionRequestSchema = z
  .object({
    orchestrationId: z.string().optional().openapi({
      description: "Orchestration ID (optional - uses taskRunId from JWT if not provided)",
    }),
    taskRunId: z.string().optional().openapi({ description: "Task run ID" }),
    providerSessionId: z.string().optional().openapi({ description: "Claude session ID" }),
    providerThreadId: z.string().optional().openapi({ description: "Codex thread ID" }),
    replyChannel: z.enum(["mailbox", "sse", "pty", "ui"]).optional().openapi({
      description: "Preferred communication channel",
    }),
    agentName: z.string().optional().openapi({ description: "Agent name" }),
    sessionId: z.string().optional().openapi({
      description: "Generic session ID (alias for providerSessionId)",
    }),
    provider: z.string().optional().openapi({
      description: "Provider name (claude, codex, etc.)",
    }),
  })
  .openapi("BindSessionRequest");

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/v1/cmux/orchestration/sessions/bind
 * Bind a provider session to the current task.
 */
orchestrateSessionsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/v1/cmux/orchestration/sessions/bind",
    tags: ["Orchestration"],
    summary: "Bind provider session",
    description: "Bind a provider-specific session ID to the current task for session resume support.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: BindSessionRequestSchema,
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
              bindingId: z.string(),
              updated: z.boolean(),
            }),
          },
        },
        description: "Session bound successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    let teamSlugOrId: string | undefined;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = extractTeamFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("Unauthorized - no team context", 401);
    }

    const body = c.req.valid("json");

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      const taskId = extractTaskRunIdFromJwt(authHeader);

      if (!taskId) {
        return c.text("Task ID not found in JWT", 400);
      }

      const agentName = body.agentName ?? "unknown";
      const provider = (body.provider ?? agentName.split("/")[0]) as
        | "claude"
        | "codex"
        | "gemini"
        | "opencode"
        | "amp"
        | "grok"
        | "cursor"
        | "qwen";

      const bindingKey = body.orchestrationId ?? taskId;
      const providerSessionId = body.providerSessionId ?? body.sessionId;

      const result = await adminClient.mutation(
        internal.providerSessions.bindSessionInternal,
        {
          teamId: teamSlugOrId,
          orchestrationId: bindingKey,
          taskId,
          taskRunId: body.taskRunId as Id<"taskRuns"> | undefined,
          agentName,
          provider,
          mode: "worker" as const,
          providerSessionId,
          providerThreadId: body.providerThreadId,
        }
      );

      return c.json({
        bindingId: String(result),
        updated: false,
      });
    } catch (error) {
      console.error("[orchestrate] Failed to bind session:", error);
      return c.text("Failed to bind session", 500);
    }
  }
);

/**
 * GET /api/v1/cmux/orchestration/sessions/:taskId
 * Get the provider session binding for a task.
 */
orchestrateSessionsRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/v1/cmux/orchestration/sessions/{taskId}",
    tags: ["Orchestration"],
    summary: "Get provider session",
    description: "Get the provider session binding for a task.",
    request: {
      params: z.object({
        taskId: z.string().openapi({ description: "Task ID" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              taskId: z.string(),
              orchestrationId: z.string(),
              provider: z.string(),
              agentName: z.string(),
              mode: z.string(),
              providerSessionId: z.string().optional(),
              providerThreadId: z.string().optional(),
              replyChannel: z.string().optional(),
              status: z.string(),
              lastActiveAt: z.number().optional(),
            }),
          },
        },
        description: "Session found",
      },
      401: { description: "Unauthorized" },
      404: { description: "Session not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    let teamSlugOrId: string | undefined;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = extractTeamFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("Unauthorized - no team context", 401);
    }

    const { taskId } = c.req.valid("param");

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      const session = await adminClient.query(
        internal.providerSessions.getForResume,
        { taskId }
      );

      if (!session || session.teamId !== teamSlugOrId) {
        return c.text("Session not found", 404);
      }

      return c.json({
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
      });
    } catch (error) {
      console.error("[orchestrate] Failed to get session:", error);
      return c.text("Failed to get session", 500);
    }
  }
);
