/**
 * Orchestration Context Health Routes
 *
 * Read-only endpoints for context health visibility:
 * - GET /v1/cmux/orchestration/context-health - Get context health summary for current task run
 */

import { getConvexAdmin } from "@/lib/utils/get-convex";
import { internal } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

export const orchestrateContextHealthRouter = new OpenAPIHono();

// ============================================================================
// Schemas
// ============================================================================

const ContextHealthResponseSchema = z.object({
  taskRunId: z.string(),
  provider: z.string(),
  // Context usage stats
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  contextWindow: z.number().optional(),
  usagePercent: z.number().optional(),
  // Warning state
  latestWarningSeverity: z.enum(["info", "warning", "critical"]).nullable(),
  topWarningReasons: z.array(z.string()),
  warningCount: z.number(),
  // Compaction state
  recentCompactionCount: z.number(),
  // Timestamps
  lastUpdatedAt: z.number().optional(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/v1/cmux/orchestration/context-health
 * Get context health summary for the current task run.
 * Requires JWT auth (from sandbox agent).
 */
orchestrateContextHealthRouter.openapi(
  createRoute({
    method: "get",
    path: "/v1/cmux/orchestration/context-health",
    tags: ["orchestration-context-health"],
    summary: "Get context health summary",
    description:
      "Get context usage, warnings, and compaction state for the current task run. Used by agents to monitor their own context health.",
    responses: {
      200: {
        description: "Context health summary",
        content: {
          "application/json": {
            schema: ContextHealthResponseSchema,
          },
        },
      },
      401: { description: "Unauthorized" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import("@/lib/utils/jwt-task-run");
    const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
    if (!jwtToken) {
      return c.text("Unauthorized - missing x-cmux-token header", 401);
    }

    const jwtPayload = await verifyTaskRunJwt(jwtToken);
    if (!jwtPayload) {
      return c.text("Unauthorized - invalid JWT", 401);
    }

    // taskRunId from JWT must be a valid Convex ID
    const taskRunId = jwtPayload.taskRunId;
    if (!taskRunId || !taskRunId.startsWith("ns7")) {
      return c.text("Unauthorized - JWT missing valid taskRunId", 401);
    }

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      const summary = await adminClient.query(internal.taskRuns.getContextHealthSummary, {
        id: taskRunId as never, // Convex ID type
      });

      if (!summary) {
        return c.text("Task run not found", 404);
      }

      return c.json(summary);
    } catch (error) {
      console.error("[orchestrate] Failed to get context health:", error);
      return c.text("Failed to get context health", 500);
    }
  }
);
