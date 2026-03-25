/**
 * Orchestration Simplify Gate Routes
 *
 * Endpoints for /simplify pre-merge gate:
 * - POST /v1/cmux/orchestration/simplify/mark-passed - Mark /simplify as passed
 * - POST /v1/cmux/orchestration/simplify/skip - Skip /simplify requirement
 * - GET /v1/cmux/orchestration/simplify/settings - Get simplify settings for team
 * - GET /v1/cmux/orchestration/simplify/status - Check if /simplify passed for task run
 */

import { getConvexAdmin } from "@/lib/utils/get-convex";
import { publishSimplifyCheckRun } from "@/lib/utils/github-check-runs";
import { internal } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

export const orchestrateSimplifyRouter = new OpenAPIHono();

// ============================================================================
// Schemas
// ============================================================================

const SimplifyModeSchema = z.enum(["quick", "full", "staged-only"]);

const MarkSimplifyPassedRequestSchema = z.object({
  mode: SimplifyModeSchema.default("quick").openapi({
    description: "Which /simplify mode was used",
    example: "quick",
  }),
});

const MarkSimplifyPassedResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  passedAt: z.number().optional().openapi({
    description: "Timestamp when /simplify passed",
  }),
});

const SkipSimplifyRequestSchema = z.object({
  reason: z.string().min(1).openapi({
    description: "Reason for skipping /simplify requirement",
    example: "No code changes made",
  }),
});

const SkipSimplifyResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const SimplifySettingsResponseSchema = z.object({
  requireSimplifyBeforeMerge: z.boolean().openapi({
    description: "Whether /simplify is required before merge",
  }),
  simplifyMode: SimplifyModeSchema.openapi({
    description: "Default /simplify mode",
  }),
  simplifyTimeoutMinutes: z.number().openapi({
    description: "Timeout for /simplify in minutes",
  }),
});

const SimplifyStatusResponseSchema = z.object({
  required: z.boolean().openapi({
    description: "Whether /simplify is required for this task",
  }),
  passed: z.boolean().openapi({
    description: "Whether /simplify has passed",
  }),
  passedAt: z.number().optional().openapi({
    description: "Timestamp when /simplify passed",
  }),
  mode: SimplifyModeSchema.optional().openapi({
    description: "Which /simplify mode was used",
  }),
  skippedReason: z.string().optional().openapi({
    description: "Reason if /simplify was skipped",
  }),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/v1/cmux/orchestration/simplify/mark-passed
 * Mark /simplify as having passed for the current task run.
 * Called by the track-simplify hook when /simplify skill completes.
 */
orchestrateSimplifyRouter.openapi(
  createRoute({
    method: "post",
    path: "/v1/cmux/orchestration/simplify/mark-passed",
    tags: ["orchestration-simplify"],
    summary: "Mark /simplify as passed",
    description:
      "Mark /simplify as having passed for the current task run. Called by hooks after /simplify completes.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: MarkSimplifyPassedRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "/simplify marked as passed",
        content: {
          "application/json": {
            schema: MarkSimplifyPassedResponseSchema,
          },
        },
      },
      401: { description: "Unauthorized" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import(
      "@/lib/utils/jwt-task-run"
    );
    const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
    if (!jwtToken) {
      return c.text("Unauthorized - missing x-cmux-token header", 401);
    }

    const jwtPayload = await verifyTaskRunJwt(jwtToken);
    if (!jwtPayload) {
      return c.text("Unauthorized - invalid JWT", 401);
    }

    const { mode } = c.req.valid("json");

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      if (!jwtPayload.taskRunId) {
        return c.text("Task run ID not found in token", 404);
      }

      const result = await adminClient.mutation(
        internal.taskRuns.markSimplifyPassed,
        {
          taskRunId: jwtPayload.taskRunId as Id<"taskRuns">,
          mode,
        }
      );

      // Publish GitHub check run if PR info available
      if (result.success && result.prInfo) {
        const { repoFullName, headSha } = result.prInfo;
        const taskRunUrl = `https://cmux.sh/tasks/${jwtPayload.taskRunId}`;

        publishSimplifyCheckRun({
          repoFullName,
          headSha,
          passed: true,
          mode,
          taskRunUrl,
        }).catch((err) => {
          console.error("[orchestrate] Failed to publish GitHub check:", err);
        });
      }

      return c.json({
        success: result.success,
        message: `/simplify (${mode}) marked as passed`,
        passedAt: Date.now(),
      });
    } catch (error) {
      console.error("[orchestrate] Failed to mark /simplify passed:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return c.text("Task run not found", 404);
      }
      return c.text("Failed to mark /simplify passed", 500);
    }
  }
);

/**
 * POST /api/v1/cmux/orchestration/simplify/skip
 * Skip /simplify requirement for the current task run.
 * Used when task has no code changes or other valid reason.
 */
orchestrateSimplifyRouter.openapi(
  createRoute({
    method: "post",
    path: "/v1/cmux/orchestration/simplify/skip",
    tags: ["orchestration-simplify"],
    summary: "Skip /simplify requirement",
    description:
      "Skip /simplify requirement for the current task run with a reason.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: SkipSimplifyRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "/simplify requirement skipped",
        content: {
          "application/json": {
            schema: SkipSimplifyResponseSchema,
          },
        },
      },
      401: { description: "Unauthorized" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import(
      "@/lib/utils/jwt-task-run"
    );
    const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
    if (!jwtToken) {
      return c.text("Unauthorized - missing x-cmux-token header", 401);
    }

    const jwtPayload = await verifyTaskRunJwt(jwtToken);
    if (!jwtPayload) {
      return c.text("Unauthorized - invalid JWT", 401);
    }

    const { reason } = c.req.valid("json");

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      if (!jwtPayload.taskRunId) {
        return c.text("Task run ID not found in token", 404);
      }

      const result = await adminClient.mutation(
        internal.taskRuns.skipSimplifyRequirement,
        {
          taskRunId: jwtPayload.taskRunId as Id<"taskRuns">,
          reason,
        }
      );

      return c.json({
        success: result.success,
        message: `/simplify requirement skipped: ${reason}`,
      });
    } catch (error) {
      console.error("[orchestrate] Failed to skip /simplify:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return c.text("Task run not found", 404);
      }
      return c.text("Failed to skip /simplify requirement", 500);
    }
  }
);

/**
 * GET /api/v1/cmux/orchestration/simplify/settings
 * Get /simplify gate settings for the team.
 */
orchestrateSimplifyRouter.openapi(
  createRoute({
    method: "get",
    path: "/v1/cmux/orchestration/simplify/settings",
    tags: ["orchestration-simplify"],
    summary: "Get /simplify settings",
    description: "Get /simplify gate settings for the team from the JWT.",
    responses: {
      200: {
        description: "Settings retrieved successfully",
        content: {
          "application/json": {
            schema: SimplifySettingsResponseSchema,
          },
        },
      },
      401: { description: "Unauthorized" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import(
      "@/lib/utils/jwt-task-run"
    );
    const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
    if (!jwtToken) {
      return c.text("Unauthorized - missing x-cmux-token header", 401);
    }

    const jwtPayload = await verifyTaskRunJwt(jwtToken);
    if (!jwtPayload) {
      return c.text("Unauthorized - invalid JWT", 401);
    }

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      const settings = await adminClient.query(
        internal.orchestrationSettings.getByTeamIdInternal,
        { teamId: jwtPayload.teamId }
      );

      return c.json({
        requireSimplifyBeforeMerge: settings.requireSimplifyBeforeMerge,
        simplifyMode: settings.simplifyMode,
        simplifyTimeoutMinutes: settings.simplifyTimeoutMinutes,
      });
    } catch (error) {
      console.error("[orchestrate] Failed to get simplify settings:", error);
      return c.text("Failed to get simplify settings", 500);
    }
  }
);

/**
 * GET /api/v1/cmux/orchestration/simplify/status
 * Check if /simplify has passed for the current task run.
 */
orchestrateSimplifyRouter.openapi(
  createRoute({
    method: "get",
    path: "/v1/cmux/orchestration/simplify/status",
    tags: ["orchestration-simplify"],
    summary: "Get /simplify status",
    description:
      "Check if /simplify has passed for the current task run. Used by simplify-gate hook.",
    responses: {
      200: {
        description: "Status retrieved successfully",
        content: {
          "application/json": {
            schema: SimplifyStatusResponseSchema,
          },
        },
      },
      401: { description: "Unauthorized" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import(
      "@/lib/utils/jwt-task-run"
    );
    const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
    if (!jwtToken) {
      return c.text("Unauthorized - missing x-cmux-token header", 401);
    }

    const jwtPayload = await verifyTaskRunJwt(jwtToken);
    if (!jwtPayload) {
      return c.text("Unauthorized - invalid JWT", 401);
    }

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      if (!jwtPayload.taskRunId) {
        return c.text("Task run ID not found in token", 404);
      }

      // Get team settings to check if required
      const settings = await adminClient.query(
        internal.orchestrationSettings.getByTeamIdInternal,
        { teamId: jwtPayload.teamId }
      );

      // Get task run to check if passed
      const taskRun = await adminClient.query(internal.taskRuns.getInternal, {
        id: jwtPayload.taskRunId as Id<"taskRuns">,
      });

      if (!taskRun) {
        return c.text("Task run not found", 404);
      }

      const passed = !!taskRun.simplifyPassedAt || !!taskRun.simplifySkippedReason;

      return c.json({
        required: settings.requireSimplifyBeforeMerge,
        passed,
        passedAt: taskRun.simplifyPassedAt,
        mode: taskRun.simplifyMode as "quick" | "full" | "staged-only" | undefined,
        skippedReason: taskRun.simplifySkippedReason,
      });
    } catch (error) {
      console.error("[orchestrate] Failed to get simplify status:", error);
      if (error instanceof Error && error.message.includes("not found")) {
        return c.text("Task run not found", 404);
      }
      return c.text("Failed to get simplify status", 500);
    }
  }
);
