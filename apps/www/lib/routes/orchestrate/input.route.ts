/**
 * Orchestration Input Queue Routes
 *
 * Active-turn steering endpoints for operators to queue instructions:
 * - POST /orchestrate/input/:orchestrationId - Queue operator input
 * - GET /orchestrate/input/:orchestrationId/status - Get queue status
 * - POST /orchestrate/input/:orchestrationId/clear - Clear queue (interrupt)
 * - POST /orchestrate/input/:orchestrationId/drain - Drain and merge inputs
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { extractTeamFromJwt, extractTaskRunIdFromJwt, mapDomainError } from "./_helpers";

export const orchestrateInputRouter = new OpenAPIHono();

// ============================================================================
// Schemas
// ============================================================================

const InputPrioritySchema = z.enum(["high", "normal", "low"]).openapi("InputPriority");

const QueueStatusResponseSchema = z.object({
  depth: z.number().openapi({ description: "Current number of pending inputs" }),
  capacity: z.number().openapi({ description: "Maximum queue capacity" }),
  hasPendingInputs: z.boolean().openapi({ description: "Whether there are pending inputs" }),
  oldestInputAt: z.number().optional().openapi({ description: "Timestamp of oldest pending input" }),
}).openapi("QueueStatusResponse");

const QueueInputResponseSchema = z.union([
  z.object({
    success: z.literal(true),
    inputId: z.string().openapi({ description: "ID of queued input" }),
    queueDepth: z.number().openapi({ description: "Current queue depth after insert" }),
  }),
  z.object({
    success: z.literal(false),
    error: z.literal("QUEUE_FULL"),
    queueDepth: z.number().openapi({ description: "Current queue depth" }),
    queueCapacity: z.number().openapi({ description: "Maximum queue capacity" }),
  }),
]).openapi("QueueInputResponse");

const DrainInputsResponseSchema = z.object({
  content: z.string().openapi({ description: "Merged input content (newline separated)" }),
  count: z.number().openapi({ description: "Number of inputs drained" }),
  batchId: z.string().openapi({ description: "Batch ID for tracking" }),
  inputIds: z.array(z.string()).openapi({ description: "IDs of drained inputs" }),
}).openapi("DrainInputsResponse");

const ClearQueueResponseSchema = z.object({
  clearedCount: z.number().openapi({ description: "Number of inputs cleared" }),
  batchId: z.string().openapi({ description: "Batch ID for tracking" }),
}).openapi("ClearQueueResponse");

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/orchestrate/input/:orchestrationId
 * Queue an operator steering input for the next turn boundary.
 */
orchestrateInputRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/input/{orchestrationId}",
    tags: ["Orchestration", "Input Queue"],
    summary: "Queue operator input",
    description: "Queue a steering instruction for the next turn boundary. Returns QUEUE_FULL error if at capacity.",
    request: {
      params: z.object({
        orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              content: z.string().min(1).openapi({ description: "The steering instruction" }),
              priority: InputPrioritySchema.optional().default("normal").openapi({
                description: "Input priority (high for interrupts, normal for guidance, low for background)",
              }),
              teamSlugOrId: z.string().optional().openapi({ description: "Team slug or ID (extracted from JWT if not provided)" }),
              taskRunId: z.string().optional().openapi({ description: "Specific task run to target (optional)" }),
              queueCapacity: z.number().optional().openapi({ description: "Override default queue capacity" }),
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
            schema: QueueInputResponseSchema,
          },
        },
        description: "Input queued or queue full response",
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);

    const body = c.req.valid("json");
    let teamSlugOrId = body.teamSlugOrId;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = teamSlugOrId ?? extractTeamFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("teamSlugOrId required", 400);
    }

    const { orchestrationId } = c.req.valid("param");

    try {
      if (!accessToken) {
        return c.text("OAuth token required", 401);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const result = await convex.mutation(api.operatorInputQueue.queueInput, {
        teamSlugOrId,
        orchestrationId,
        taskRunId: body.taskRunId as unknown as undefined, // Type cast for optional Id
        content: body.content,
        priority: body.priority ?? "normal",
        queueCapacity: body.queueCapacity,
      });

      return c.json(result);
    } catch (error) {
      console.error("[orchestrate] Failed to queue input:", error);
      const mapped = mapDomainError(error);
      if (mapped) return c.text(mapped.message, mapped.status);
      return c.text("Failed to queue input", 500);
    }
  }
);

/**
 * GET /api/orchestrate/input/:orchestrationId/status
 * Get queue status for an orchestration.
 */
orchestrateInputRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/input/{orchestrationId}/status",
    tags: ["Orchestration", "Input Queue"],
    summary: "Get queue status",
    description: "Get the current status of the operator input queue for an orchestration.",
    request: {
      params: z.object({
        orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
      }),
      query: z.object({
        teamSlugOrId: z.string().optional().openapi({ description: "Team slug or ID (extracted from JWT if not provided)" }),
        queueCapacity: z.coerce.number().optional().openapi({ description: "Override default queue capacity for status" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: QueueStatusResponseSchema,
          },
        },
        description: "Queue status retrieved successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);

    let teamSlugOrId = c.req.valid("query").teamSlugOrId;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = teamSlugOrId ?? extractTeamFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("teamSlugOrId required", 400);
    }

    const { orchestrationId } = c.req.valid("param");
    const { queueCapacity } = c.req.valid("query");

    try {
      if (!accessToken) {
        return c.text("OAuth token required", 401);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const status = await convex.query(api.operatorInputQueue.getQueueStatus, {
        teamSlugOrId,
        orchestrationId,
        queueCapacity,
      });

      return c.json(status);
    } catch (error) {
      console.error("[orchestrate] Failed to get queue status:", error);
      return c.text("Failed to get queue status", 500);
    }
  }
);

/**
 * POST /api/orchestrate/input/:orchestrationId/drain
 * Drain all pending inputs, merging with newlines.
 */
orchestrateInputRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/input/{orchestrationId}/drain",
    tags: ["Orchestration", "Input Queue"],
    summary: "Drain inputs",
    description: "Drain all pending inputs at turn boundary. Returns merged content with newlines.",
    request: {
      params: z.object({
        orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string().optional().openapi({ description: "Team slug or ID (extracted from JWT if not provided)" }),
              taskRunId: z.string().optional().openapi({ description: "Filter by specific task run" }),
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
            schema: DrainInputsResponseSchema,
          },
        },
        description: "Inputs drained successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);

    const body = c.req.valid("json");
    let teamSlugOrId = body.teamSlugOrId;
    let taskRunId = body.taskRunId;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = teamSlugOrId ?? extractTeamFromJwt(authHeader);
      taskRunId = taskRunId ?? extractTaskRunIdFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("teamSlugOrId required", 400);
    }

    const { orchestrationId } = c.req.valid("param");

    try {
      if (!accessToken) {
        return c.text("OAuth token required", 401);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const result = await convex.mutation(api.operatorInputQueue.drainInputs, {
        teamSlugOrId,
        orchestrationId,
        taskRunId: taskRunId as unknown as undefined,
      });

      return c.json(result);
    } catch (error) {
      console.error("[orchestrate] Failed to drain inputs:", error);
      const mapped = mapDomainError(error);
      if (mapped) return c.text(mapped.message, mapped.status);
      return c.text("Failed to drain inputs", 500);
    }
  }
);

/**
 * POST /api/orchestrate/input/:orchestrationId/clear
 * Clear all pending inputs (for interrupts).
 */
orchestrateInputRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/input/{orchestrationId}/clear",
    tags: ["Orchestration", "Input Queue"],
    summary: "Clear queue",
    description: "Clear all pending inputs. Used for interrupt scenarios when starting fresh.",
    request: {
      params: z.object({
        orchestrationId: z.string().openapi({ description: "Orchestration ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string().optional().openapi({ description: "Team slug or ID (extracted from JWT if not provided)" }),
              taskRunId: z.string().optional().openapi({ description: "Filter by specific task run" }),
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
            schema: ClearQueueResponseSchema,
          },
        },
        description: "Queue cleared successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);

    const body = c.req.valid("json");
    let teamSlugOrId = body.teamSlugOrId;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = teamSlugOrId ?? extractTeamFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("teamSlugOrId required", 400);
    }

    const { orchestrationId } = c.req.valid("param");

    try {
      if (!accessToken) {
        return c.text("OAuth token required", 401);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
      const convex = getConvex({ accessToken });

      const result = await convex.mutation(api.operatorInputQueue.clearQueue, {
        teamSlugOrId,
        orchestrationId,
        taskRunId: body.taskRunId as unknown as undefined,
      });

      return c.json(result);
    } catch (error) {
      console.error("[orchestrate] Failed to clear queue:", error);
      const mapped = mapDomainError(error);
      if (mapped) return c.text(mapped.message, mapped.status);
      return c.text("Failed to clear queue", 500);
    }
  }
);
