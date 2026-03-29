import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import {
  RunControlAppendInstructionRequestSchema,
  RunControlCommandResponseSchema,
  RunControlInspectRequestSchema,
  RunControlApprovalRequestSchema,
  RunControlContinueRequestSchema,
  RunControlResumeRequestSchema,
  RunControlSummarySchema,
} from "@cmux/shared";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { mapDomainError } from "./orchestrate/_helpers";

const RunControlPathParamsSchema = z.object({
  runId: z.string().openapi({ description: "Task run ID" }),
});

export const runControlRouter = new OpenAPIHono();

async function requireRunControlAccess(
  request: Request,
  teamSlugOrId: string,
) {
  const accessToken = await getAccessTokenFromRequest(request);
  if (!accessToken) {
    return null;
  }

  await verifyTeamAccess({
    req: request,
    accessToken,
    teamSlugOrId,
  });

  return {
    accessToken,
    convex: getConvex({ accessToken }),
  };
}

runControlRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/run-control/inspect/{runId}",
    tags: ["Run Control"],
    summary: "Inspect the unified run-control state for a task run",
    request: {
      params: RunControlPathParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: RunControlInspectRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RunControlCommandResponseSchema,
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
    const { runId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");

    try {
      const access = await requireRunControlAccess(c.req.raw, teamSlugOrId);
      if (!access) {
        return c.text("Unauthorized", 401);
      }

      const summary = await access.convex.query(api.taskRuns.getRunControlSummary, {
        teamSlugOrId,
        taskRunId: runId as Id<"taskRuns">,
      });

      if (!summary) {
        return c.text("Run control summary not found", 404);
      }

      return c.json({
        success: true,
        action: "inspect",
        summary,
      });
    } catch (error) {
      console.error("[run-control] Failed to inspect run:", error);
      const mapped = mapDomainError(error);
      if (mapped) {
        return c.text(mapped.message, mapped.status);
      }
      return c.text("Failed to inspect run control", 500);
    }
  },
);

runControlRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/run-control/approve/{runId}",
    tags: ["Run Control"],
    summary: "Resolve the active approval for a task run",
    request: {
      params: RunControlPathParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: RunControlApprovalRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RunControlCommandResponseSchema,
          },
        },
        description: "Approval resolved successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const access = await requireRunControlAccess(c.req.raw, body.teamSlugOrId);
      if (!access) {
        return c.text("Unauthorized", 401);
      }

      const response = await access.convex.mutation(api.taskRuns.approveRunControl, {
        teamSlugOrId: body.teamSlugOrId,
        taskRunId: runId as Id<"taskRuns">,
        requestId: body.requestId,
        resolution: body.resolution,
        note: body.note,
      });

      return c.json(RunControlCommandResponseSchema.parse(response));
    } catch (error) {
      console.error("[run-control] Failed to approve run:", error);
      const mapped = mapDomainError(error);
      if (mapped) {
        return c.text(mapped.message, mapped.status);
      }
      return c.text("Failed to approve run control", 500);
    }
  },
);

runControlRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/run-control/continue/{runId}",
    tags: ["Run Control"],
    summary: "Continue a run by queuing operator instruction and clearing interruptions",
    request: {
      params: RunControlPathParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: RunControlContinueRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RunControlCommandResponseSchema,
          },
        },
        description: "Run continuation queued successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const access = await requireRunControlAccess(c.req.raw, body.teamSlugOrId);
      if (!access) {
        return c.text("Unauthorized", 401);
      }

      const response = await access.convex.mutation(api.taskRuns.continueRunControl, {
        teamSlugOrId: body.teamSlugOrId,
        taskRunId: runId as Id<"taskRuns">,
        instruction: body.instruction,
        priority: body.priority,
      });

      return c.json(RunControlCommandResponseSchema.parse(response));
    } catch (error) {
      console.error("[run-control] Failed to continue run:", error);
      const mapped = mapDomainError(error);
      if (mapped) {
        return c.text(mapped.message, mapped.status);
      }
      return c.text("Failed to continue run control", 500);
    }
  },
);

runControlRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/run-control/resume/{runId}",
    tags: ["Run Control"],
    summary: "Resume an interrupted run or checkpoint-backed session",
    request: {
      params: RunControlPathParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: RunControlResumeRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RunControlCommandResponseSchema,
          },
        },
        description: "Run resume queued successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const access = await requireRunControlAccess(c.req.raw, body.teamSlugOrId);
      if (!access) {
        return c.text("Unauthorized", 401);
      }

      const response = await access.convex.mutation(api.taskRuns.resumeRunControl, {
        teamSlugOrId: body.teamSlugOrId,
        taskRunId: runId as Id<"taskRuns">,
        instruction: body.instruction,
        priority: body.priority,
      });

      return c.json(RunControlCommandResponseSchema.parse(response));
    } catch (error) {
      console.error("[run-control] Failed to resume run:", error);
      const mapped = mapDomainError(error);
      if (mapped) {
        return c.text(mapped.message, mapped.status);
      }
      return c.text("Failed to resume run control", 500);
    }
  },
);

runControlRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/run-control/append-instruction/{runId}",
    tags: ["Run Control"],
    summary: "Append an operator instruction to a running task run",
    request: {
      params: RunControlPathParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: RunControlAppendInstructionRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RunControlCommandResponseSchema,
          },
        },
        description: "Instruction queued successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const access = await requireRunControlAccess(c.req.raw, body.teamSlugOrId);
      if (!access) {
        return c.text("Unauthorized", 401);
      }

      const response = await access.convex.mutation(
        api.taskRuns.appendInstructionRunControl,
        {
          teamSlugOrId: body.teamSlugOrId,
          taskRunId: runId as Id<"taskRuns">,
          instruction: body.instruction,
          priority: body.priority,
        },
      );

      return c.json(RunControlCommandResponseSchema.parse(response));
    } catch (error) {
      console.error("[run-control] Failed to append instruction:", error);
      const mapped = mapDomainError(error);
      if (mapped) {
        return c.text(mapped.message, mapped.status);
      }
      return c.text("Failed to append run-control instruction", 500);
    }
  },
);

export { RunControlSummarySchema };
