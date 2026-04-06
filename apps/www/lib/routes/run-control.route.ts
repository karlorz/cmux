import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import {
  deriveLocalRunControlState,
  RUN_CONTROL_DEFAULT_INSTRUCTIONS,
  RUN_CONTROL_DEFAULT_TIMEOUT_MINUTES,
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

async function resolveTaskRunId(access: NonNullable<Awaited<ReturnType<typeof requireRunControlAccess>>>, input: {
  runId: string;
  teamSlugOrId: string;
}) {
  if (!input.runId.startsWith("local_")) {
    return input.runId;
  }

  const localLaunch = await access.convex.query(api.localClaudeLaunches.getByOrchestrationId, {
    teamSlugOrId: input.teamSlugOrId,
    orchestrationId: input.runId,
  });

  return localLaunch?.taskRunId ?? null;
}

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

type LocalRunControlDetail = {
  orchestrationId?: string;
  agent?: string;
  status?: "running" | "completed" | "failed" | "unknown";
  sessionId?: string;
  threadId?: string;
  checkpointRef?: string;
  checkpointGeneration?: number;
};

async function fetchLocalRunControlDetail(input: {
  accessToken: string;
  teamSlugOrId: string;
  runId: string;
}) {
  const detailResponse = await fetch(
    `http://localhost:9779/api/orchestrate/local-runs/${encodeURIComponent(input.runId)}?teamSlugOrId=${encodeURIComponent(input.teamSlugOrId)}&logs=false&events=false`,
    {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
      },
    },
  );

  if (!detailResponse.ok) {
    throw new Error("Local run detail not found");
  }

  return (await detailResponse.json()) as LocalRunControlDetail;
}

function buildLocalRunControlSummary(input: {
  runId: string;
  detail: LocalRunControlDetail;
}) {
  const localState = deriveLocalRunControlState({
    status: input.detail.status,
    sessionId: input.detail.sessionId,
    threadId: input.detail.threadId,
    checkpointRef: input.detail.checkpointRef,
  });

  return {
    taskRunId: input.runId,
    taskId: input.runId,
    orchestrationId: input.detail.orchestrationId ?? input.runId,
    agentName: input.detail.agent,
    provider: input.detail.agent?.split("/")[0] ?? "claude",
    runStatus: localState.runStatus,
    lifecycle: {
      status: localState.lifecycleStatus,
      interrupted: localState.canResumeCheckpoint,
      interruptionStatus: localState.interruptionStatus,
    },
    approvals: {
      pendingCount: 0,
      pendingRequestIds: [],
    },
    actions: {
      availableActions: localState.availableActions,
      canResolveApproval: false,
      canContinueSession: localState.canContinueSession,
      canResumeCheckpoint: localState.canResumeCheckpoint,
      canAppendInstruction: localState.canAppendInstruction,
    },
    continuation: {
      mode: localState.continuationMode,
      providerSessionId: input.detail.sessionId,
      providerThreadId: input.detail.threadId,
      checkpointRef: input.detail.checkpointRef,
      checkpointGeneration: input.detail.checkpointGeneration,
      hasActiveBinding: false,
    },
    timeout: {
      inactivityTimeoutMinutes: RUN_CONTROL_DEFAULT_TIMEOUT_MINUTES,
      status: "active" as const,
    },
  };
}

async function continueLocalRunControl(input: {
  accessToken: string;
  teamSlugOrId: string;
  runId: string;
  instruction?: string;
}) {
  const detail = await fetchLocalRunControlDetail({
    accessToken: input.accessToken,
    teamSlugOrId: input.teamSlugOrId,
    runId: input.runId,
  });

  if (!detail.sessionId && !detail.threadId) {
    throw new Error("Local session continuation is unavailable");
  }

  const continueResponse = await fetch(
    `http://localhost:9779/api/orchestrate/local-runs/${encodeURIComponent(input.runId)}/inject`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: input.teamSlugOrId,
        message: input.instruction?.trim() || RUN_CONTROL_DEFAULT_INSTRUCTIONS.continue_session,
      }),
    },
  );

  if (!continueResponse.ok) {
    throw new Error("Failed to continue local run");
  }

  return {
    success: true,
    action: "continue" as const,
    message: input.instruction?.trim() || RUN_CONTROL_DEFAULT_INSTRUCTIONS.continue_session,
    summary: buildLocalRunControlSummary({
      runId: input.runId,
      detail,
    }),
  };
}

async function resumeLocalRunControl(input: {
  accessToken: string;
  teamSlugOrId: string;
  runId: string;
  instruction?: string;
}) {
  const detail = await fetchLocalRunControlDetail({
    accessToken: input.accessToken,
    teamSlugOrId: input.teamSlugOrId,
    runId: input.runId,
  });

  if (!detail.checkpointRef) {
    throw new Error("Local checkpoint resume is unavailable");
  }

  const resumeResponse = await fetch(
    `http://localhost:9779/api/orchestrate/local-runs/${encodeURIComponent(input.runId)}/resume`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: input.teamSlugOrId,
        message: input.instruction?.trim() || RUN_CONTROL_DEFAULT_INSTRUCTIONS.resume_checkpoint,
      }),
    },
  );

  if (!resumeResponse.ok) {
    throw new Error("Failed to resume local checkpoint");
  }

  return {
    success: true,
    action: "resume" as const,
    message: input.instruction?.trim() || RUN_CONTROL_DEFAULT_INSTRUCTIONS.resume_checkpoint,
    summary: buildLocalRunControlSummary({
      runId: input.runId,
      detail,
    }),
  };
}

async function inspectLocalRunControl(input: {
  accessToken: string;
  teamSlugOrId: string;
  runId: string;
}) {
  const detail = await fetchLocalRunControlDetail({
    accessToken: input.accessToken,
    teamSlugOrId: input.teamSlugOrId,
    runId: input.runId,
  });

  return {
    success: true,
    action: "inspect" as const,
    summary: buildLocalRunControlSummary({
      runId: input.runId,
      detail,
    }),
  };
}

async function appendLocalRunControl(input: {
  accessToken: string;
  teamSlugOrId: string;
  runId: string;
  instruction: string;
}) {
  const detail = await fetchLocalRunControlDetail({
    accessToken: input.accessToken,
    teamSlugOrId: input.teamSlugOrId,
    runId: input.runId,
  });

  const localState = deriveLocalRunControlState({
    status: detail.status,
    sessionId: detail.sessionId,
    threadId: detail.threadId,
    checkpointRef: detail.checkpointRef,
  });
  if (localState.canContinueSession || localState.canResumeCheckpoint) {
    throw new Error("Local append instruction is unavailable");
  }

  const appendResponse = await fetch(
    `http://localhost:9779/api/orchestrate/local-runs/${encodeURIComponent(input.runId)}/inject`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        teamSlugOrId: input.teamSlugOrId,
        message: input.instruction,
      }),
    },
  );

  if (!appendResponse.ok) {
    throw new Error("Failed to append local instruction");
  }

  return {
    success: true,
    action: "append_instruction" as const,
    message: input.instruction,
    summary: buildLocalRunControlSummary({
      runId: input.runId,
      detail,
    }),
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

      const resolvedRunId = await resolveTaskRunId(access, {
        runId,
        teamSlugOrId,
      });
      if (!resolvedRunId) {
        if (runId.startsWith("local_")) {
          const response = await inspectLocalRunControl({
            accessToken: access.accessToken,
            teamSlugOrId,
            runId,
          });
          return c.json(RunControlCommandResponseSchema.parse(response));
        }
        return c.text("Run control summary not found", 404);
      }

      const summary = await access.convex.query(api.taskRuns.getRunControlSummary, {
        teamSlugOrId,
        taskRunId: resolvedRunId as Id<"taskRuns">,
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

      const resolvedRunId = await resolveTaskRunId(access, {
        runId,
        teamSlugOrId: body.teamSlugOrId,
      });
      if (!resolvedRunId) {
        return c.text("Task run not found", 404);
      }

      const response = await access.convex.mutation(api.taskRuns.approveRunControl, {
        teamSlugOrId: body.teamSlugOrId,
        taskRunId: resolvedRunId as Id<"taskRuns">,
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

      const resolvedRunId = await resolveTaskRunId(access, {
        runId,
        teamSlugOrId: body.teamSlugOrId,
      });
      if (!resolvedRunId) {
        if (runId.startsWith("local_")) {
          const response = await continueLocalRunControl({
            accessToken: access.accessToken,
            teamSlugOrId: body.teamSlugOrId,
            runId,
            instruction: body.instruction,
          });
          return c.json(RunControlCommandResponseSchema.parse(response));
        }
        return c.text("Task run not found", 404);
      }

      const response = await access.convex.mutation(api.taskRuns.continueRunControl, {
        teamSlugOrId: body.teamSlugOrId,
        taskRunId: resolvedRunId as Id<"taskRuns">,
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

      const resolvedRunId = await resolveTaskRunId(access, {
        runId,
        teamSlugOrId: body.teamSlugOrId,
      });
      if (!resolvedRunId) {
        if (runId.startsWith("local_")) {
          const response = await resumeLocalRunControl({
            accessToken: access.accessToken,
            teamSlugOrId: body.teamSlugOrId,
            runId,
            instruction: body.instruction,
          });
          return c.json(RunControlCommandResponseSchema.parse(response));
        }
        return c.text("Task run not found", 404);
      }

      const response = await access.convex.mutation(api.taskRuns.resumeRunControl, {
        teamSlugOrId: body.teamSlugOrId,
        taskRunId: resolvedRunId as Id<"taskRuns">,
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

      const resolvedRunId = await resolveTaskRunId(access, {
        runId,
        teamSlugOrId: body.teamSlugOrId,
      });
      if (!resolvedRunId) {
        if (runId.startsWith("local_")) {
          const response = await appendLocalRunControl({
            accessToken: access.accessToken,
            teamSlugOrId: body.teamSlugOrId,
            runId,
            instruction: body.instruction,
          });
          return c.json(RunControlCommandResponseSchema.parse(response));
        }
        return c.text("Task run not found", 404);
      }

      const response = await access.convex.mutation(
        api.taskRuns.appendInstructionRunControl,
        {
          teamSlugOrId: body.teamSlugOrId,
          taskRunId: resolvedRunId as Id<"taskRuns">,
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
