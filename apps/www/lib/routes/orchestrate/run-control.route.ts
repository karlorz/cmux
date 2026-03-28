import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { mapDomainError } from "./_helpers";

export const orchestrateRunControlRouter = new OpenAPIHono();

const RunControlActionSchema = z
  .enum([
    "resolve_approval",
    "continue_session",
    "resume_checkpoint",
    "append_instruction",
  ])
  .openapi("RunControlAction");

const RunControlContinuationModeSchema = z
  .enum([
    "session_continuation",
    "checkpoint_restore",
    "append_instruction",
    "none",
  ])
  .openapi("RunControlContinuationMode");

const RunControlSummarySchema = z
  .object({
    taskRunId: z.string().openapi({ description: "Task run ID" }),
    taskId: z.string().openapi({ description: "Task ID" }),
    orchestrationId: z.string().optional().openapi({
      description: "Parent orchestration ID if present",
    }),
    agentName: z.string().optional().openapi({ description: "Agent name" }),
    provider: z.string().openapi({ description: "Provider inferred from agent or binding" }),
    runStatus: z
      .enum(["pending", "running", "completed", "failed", "skipped"])
      .openapi({ description: "Raw task-run status" }),
    lifecycle: z.object({
      status: z
        .enum(["active", "interrupted", "completed", "failed", "skipped"])
        .openapi({ description: "Operator-facing lifecycle status" }),
      interrupted: z.boolean().openapi({ description: "Whether the run is currently interrupted" }),
      interruptionStatus: z
        .enum([
          "none",
          "approval_pending",
          "paused_by_operator",
          "sandbox_paused",
          "context_overflow",
          "rate_limited",
          "timed_out",
          "checkpoint_pending",
          "handoff_pending",
          "user_input_required",
        ])
        .openapi({ description: "Detailed interruption reason category" }),
      reason: z.string().optional().openapi({ description: "Human-readable interruption reason" }),
      blockedAt: z.number().optional().openapi({ description: "When the interruption started" }),
      expiresAt: z.number().optional().openapi({ description: "When the interruption expires" }),
      resolvedAt: z.number().optional().openapi({ description: "When the interruption was resolved" }),
      resolvedBy: z.string().optional().openapi({ description: "Who resolved the interruption" }),
    }),
    approvals: z.object({
      pendingCount: z.number().openapi({ description: "Count of pending approvals for this run" }),
      pendingRequestIds: z.array(z.string()).openapi({ description: "Pending approval request IDs" }),
      currentRequestId: z.string().optional().openapi({ description: "Approval request currently blocking the run" }),
      latestRequestId: z.string().optional().openapi({ description: "Latest approval request ID" }),
      latestStatus: z
        .enum(["pending", "approved", "denied", "expired", "cancelled"])
        .optional()
        .openapi({ description: "Latest approval request status" }),
      latestApprovalType: z
        .enum([
          "tool_permission",
          "review_request",
          "deployment",
          "cost_override",
          "escalation",
          "risky_action",
        ])
        .optional()
        .openapi({ description: "Latest approval type" }),
      latestAction: z.string().optional().openapi({ description: "Latest requested action" }),
      latestRiskLevel: z
        .enum(["low", "medium", "high"])
        .optional()
        .openapi({ description: "Latest approval risk level" }),
      latestCreatedAt: z.number().optional().openapi({ description: "Latest approval creation time" }),
    }),
    actions: z.object({
      availableActions: z.array(RunControlActionSchema).openapi({
        description: "Explicit actions currently available to the operator",
      }),
      canResolveApproval: z.boolean(),
      canContinueSession: z.boolean(),
      canResumeCheckpoint: z.boolean(),
      canAppendInstruction: z.boolean(),
    }),
    continuation: z.object({
      mode: RunControlContinuationModeSchema.openapi({
        description: "Primary continuation mode exposed by the shared contract",
      }),
      providerSessionId: z.string().optional(),
      providerThreadId: z.string().optional(),
      resumeToken: z.string().optional(),
      resumeTargetId: z.string().optional(),
      checkpointRef: z.string().optional(),
      checkpointGeneration: z.number().optional(),
      replyChannel: z.enum(["mailbox", "sse", "pty", "ui"]).optional(),
      sessionStatus: z.enum(["active", "suspended", "expired", "terminated"]).optional(),
      sessionMode: z.enum(["head", "worker", "reviewer"]).optional(),
      lastActiveAt: z.number().optional(),
      hasActiveBinding: z.boolean(),
    }),
  })
  .openapi("RunControlSummary");

orchestrateRunControlRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/v1/cmux/orchestration/run-control/{taskRunId}",
    tags: ["Orchestration"],
    summary: "Get shared run-control summary",
    description:
      "Return the shared run-control summary for a task run, combining interruption state, approvals, continuation capability, and checkpoint metadata.",
    request: {
      params: z.object({
        taskRunId: z.string().openapi({ description: "Task run ID" }),
      }),
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RunControlSummarySchema,
          },
        },
        description: "Run-control summary retrieved successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { taskRunId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      await verifyTeamAccess({
        req: c.req.raw,
        accessToken,
        teamSlugOrId,
      });

      const convex = getConvex({ accessToken });
      const summary = await convex.query(api.taskRuns.getRunControlSummary, {
        teamSlugOrId,
        taskRunId: taskRunId as Id<"taskRuns">,
      });

      if (!summary) {
        return c.text("Run control summary not found", 404);
      }

      return c.json(summary);
    } catch (error) {
      console.error("[orchestrate] Failed to get run-control summary:", error);
      const mapped = mapDomainError(error);
      if (mapped) {
        return c.text(mapped.message, mapped.status);
      }
      return c.text("Failed to get run-control summary", 500);
    }
  },
);
