/**
 * Orchestration Learning Routes
 *
 * Learning and rules endpoints for self-improving orchestration:
 * - POST /v1/cmux/orchestration/learning/log - Log learning event
 * - GET /v1/cmux/orchestration/rules - Get active rules
 */

import { getConvexAdmin } from "@/lib/utils/get-convex";
import { internal } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

export const orchestrateLearningRouter = new OpenAPIHono();

// ============================================================================
// Schemas
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

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/v1/cmux/orchestration/learning/log
 * Log an orchestration learning, error, or feature request.
 * Requires JWT auth (from sandbox agent).
 */
orchestrateLearningRouter.openapi(
  createRoute({
    method: "post",
    path: "/v1/cmux/orchestration/learning/log",
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
    const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import("@/lib/utils/jwt-task-run");
    const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
    if (!jwtToken) {
      return c.text("Unauthorized - missing x-cmux-token header", 401);
    }

    const jwtPayload = await verifyTaskRunJwt(jwtToken);
    if (!jwtPayload) {
      return c.text("Unauthorized - invalid JWT", 401);
    }

    const body = c.req.valid("json");

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      const sourceTaskRunId = jwtPayload.taskRunId?.startsWith("ns7") ? jwtPayload.taskRunId : undefined;
      const result = await adminClient.mutation(internal.agentOrchestrationLearning.logEventInternal, {
        teamId: jwtPayload.teamId,
        userId: jwtPayload.userId,
        eventType: body.eventType,
        payload: {
          text: body.text,
          lane: body.lane,
          confidence: body.confidence,
          metadata: body.metadata,
          sourceTaskRunId,
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

/**
 * GET /api/v1/cmux/orchestration/rules
 * Get active orchestration rules for the team.
 * Requires JWT auth (from sandbox agent).
 */
orchestrateLearningRouter.openapi(
  createRoute({
    method: "get",
    path: "/v1/cmux/orchestration/rules",
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
    const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import("@/lib/utils/jwt-task-run");
    const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
    if (!jwtToken) {
      return c.text("Unauthorized - missing x-cmux-token header", 401);
    }

    const jwtPayload = await verifyTaskRunJwt(jwtToken);
    if (!jwtPayload) {
      return c.text("Unauthorized - invalid JWT", 401);
    }

    const { lane } = c.req.valid("query");

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      const rules = await adminClient.query(internal.agentOrchestrationLearning.getActiveRulesInternal, {
        teamId: jwtPayload.teamId,
        lane,
      });

      return c.json({
        rules: rules.map((r: { _id: string; text: string; lane: string; confidence: number; projectFullName?: string }) => ({
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
