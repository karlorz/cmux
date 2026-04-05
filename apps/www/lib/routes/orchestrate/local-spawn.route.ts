/**
 * Local Spawn Route
 *
 * Enables spawning and controlling local agent runs via `devsh orchestrate`.
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { execa } from "execa";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mapDomainError } from "./_helpers";

export const orchestrateLocalSpawnRouter = new OpenAPIHono();

type LocalRunStatus = "running" | "completed" | "failed" | "unknown";
type RawLocalRun = {
  orchestrationId?: string;
  runDir?: string;
  agent?: string;
  status?: string;
  prompt?: string;
  startedAt?: string;
  completedAt?: string;
  workspace?: string;
};

const LOCAL_RUN_ARTIFACTS_PATH = [".devsh", "orchestrations"] as const;

const RawLocalRunSchema = z.object({
  orchestrationId: z.string().optional(),
  runDir: z.string().optional(),
  agent: z.string().optional(),
  status: z.string().optional(),
  prompt: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  workspace: z.string().optional(),
});

const LocalSpawnErrorSchema = z
  .object({
    error: z.string().openapi({
      description: "Error message",
      example: "Failed to spawn local run",
    }),
    details: z.string().optional().openapi({
      description: "Additional error details",
    }),
  })
  .openapi("LocalSpawnError");

const LocalRunSchema = z
  .object({
    orchestrationId: z.string(),
    runDir: z.string().optional(),
    agent: z.string(),
    status: z.enum(["running", "completed", "failed", "unknown"]),
    prompt: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    workspace: z.string().optional(),
    bridgedTaskId: z.string().optional(),
    bridgedTaskRunId: z.string().optional(),
  })
  .openapi("LocalRun");

const LocalRunDetailSchema = LocalRunSchema.extend({
  timeout: z.string().optional(),
  durationMs: z.number().optional(),
  selectedVariant: z.string().optional(),
  model: z.string().optional(),
  gitBranch: z.string().optional(),
  gitCommit: z.string().optional(),
  devshVersion: z.string().optional(),
  sessionId: z.string().optional(),
  threadId: z.string().optional(),
  codexHome: z.string().optional(),
  injectionMode: z.string().optional(),
  lastInjectionAt: z.string().optional(),
  injectionCount: z.number().optional(),
  checkpointRef: z.string().optional(),
  checkpointGeneration: z.number().optional(),
  checkpointLabel: z.string().optional(),
  checkpointCreatedAt: z.number().optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  events: z.array(
    z.object({
      timestamp: z.string(),
      type: z.string(),
      message: z.string(),
    })
  ).optional(),
}).openapi("LocalRunDetail");

const LocalRunsListResponseSchema = z
  .object({
    runs: z.array(LocalRunSchema),
    count: z.number(),
  })
  .openapi("LocalRunsListResponse");

const LocalRunInjectRequestSchema = z
  .object({
    teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
    message: z.string().min(1).openapi({ description: "Instruction to inject" }),
  })
  .openapi("LocalRunInjectRequest");

const LocalRunInjectResponseSchema = z
  .object({
    runId: z.string(),
    mode: z.string(),
    message: z.string(),
    injectionCount: z.number().optional(),
    controlLane: z.string(),
    continuationMode: z.string(),
    availableActions: z.array(z.string()),
    sessionId: z.string().optional(),
    threadId: z.string().optional(),
    checkpointRef: z.string().optional(),
    checkpointGeneration: z.number().optional(),
    checkpointLabel: z.string().optional(),
  })
  .openapi("LocalRunInjectResponse");

const LocalRunCheckpointRequestSchema = z
  .object({
    teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
    label: z.string().optional().openapi({ description: "Optional checkpoint label" }),
  })
  .openapi("LocalRunCheckpointRequest");

const LocalRunCheckpointResponseSchema = z
  .object({
    runId: z.string(),
    runDir: z.string(),
    checkpointRef: z.string(),
    checkpointGeneration: z.number(),
    label: z.string().optional(),
    createdAt: z.string(),
  })
  .openapi("LocalRunCheckpointResponse");

const LocalRunStopRequestSchema = z
  .object({
    teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
    force: z.boolean().optional().default(false).openapi({
      description: "Use SIGKILL instead of SIGTERM",
    }),
  })
  .openapi("LocalRunStopRequest");

const LocalRunStopResponseSchema = z
  .object({
    runId: z.string(),
    runDir: z.string(),
    pid: z.number(),
    signal: z.string(),
    status: z.string(),
    message: z.string(),
  })
  .openapi("LocalRunStopResponse");

const LocalSpawnRequestSchema = z
  .object({
    teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
    agent: z
      .string()
      .regex(/^(claude|codex|gemini|amp|opencode)\/[\w.-]+$/)
      .openapi({
        description:
          "Agent ID in format 'backend/model' (e.g., 'claude/opus-4.5')",
        example: "claude/haiku-4.5",
      }),
    prompt: z.string().openapi({
      description: "The task prompt for the agent",
      example: "Fix the login bug",
    }),
    workspace: z.string().optional().openapi({
      description: "Workspace directory (defaults to current directory)",
      example: "/root/workspace",
    }),
    timeout: z.string().optional().openapi({
      description: "Timeout duration (e.g., '30m', '1h')",
      example: "30m",
    }),
  })
  .openapi("LocalSpawnRequest");

const LocalSpawnResponseSchema = z
  .object({
    venue: z.literal("local").openapi({
      description: "Execution venue",
      example: "local",
    }),
    orchestrationId: z.string().openapi({
      description: "Canonical local orchestration ID",
      example: "local_www_1712345678901_abcd1234",
    }),
    runId: z.string().openapi({
      description: "Local run ID alias for the orchestration ID",
      example: "local_www_1712345678901_abcd1234",
    }),
    runDir: z.string().openapi({
      description: "Persistent local artifact directory",
      example: "/Users/example/.devsh/orchestrations/local_www_1712345678901_abcd1234",
    }),
    status: z.enum(["running", "completed", "failed", "unknown"]).openapi({
      description: "Run status",
      example: "running",
    }),
    routingReason: z.string().openapi({
      description: "Why this venue was selected",
      example: "Explicit local venue requested via UI.",
    }),
    capabilities: z.object({
      continueSession: z.boolean(),
      appendInstruction: z.boolean(),
      createCheckpoint: z.boolean(),
    }),
    followUp: z.object({
      statusId: z.string(),
      injectId: z.string(),
    }),
  })
  .openapi("LocalSpawnResponse");

type LocalRun = z.infer<typeof LocalRunSchema>;
type LocalSpawnResponse = z.infer<typeof LocalSpawnResponseSchema>;
type LocalRunsListResponse = z.infer<typeof LocalRunsListResponseSchema>;

type LocalClaudeLaunchRecord = {
  orchestrationId?: string;
  taskId?: string;
  taskRunId?: string;
};

async function getLocalLaunchBridgeRecord(
  accessToken: string,
  teamSlugOrId: string,
  orchestrationId: string,
): Promise<LocalClaudeLaunchRecord | null> {
  const convex = getConvex({ accessToken });
  return (await convex.query(api.localClaudeLaunches.getByOrchestrationId, {
    teamSlugOrId,
    orchestrationId,
  })) as LocalClaudeLaunchRecord | null;
}

function buildLocalRunBridgeMap(launches: LocalClaudeLaunchRecord[]): Map<string, LocalClaudeLaunchRecord> {
  const bridgeMap = new Map<string, LocalClaudeLaunchRecord>();
  for (const launch of launches) {
    if (launch.orchestrationId) {
      bridgeMap.set(launch.orchestrationId, launch);
    }
  }
  return bridgeMap;
}

function buildLocalRouteOrchestrationId(): string {
  return `local_www_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function buildLocalRunArtifactsDir(orchestrationId: string): string {
  return path.join(os.homedir(), ...LOCAL_RUN_ARTIFACTS_PATH, orchestrationId);
}

function normalizeLocalRunStatus(status?: string): LocalRunStatus {
  return status === "running" || status === "completed" || status === "failed"
    ? status
    : "unknown";
}

function normalizeLocalRun(
  run: RawLocalRun,
  bridgeRecord?: LocalClaudeLaunchRecord,
): LocalRun & { bridgedTaskId?: string; bridgedTaskRunId?: string } {
  return {
    orchestrationId: run.orchestrationId || "unknown",
    runDir: run.runDir,
    agent: run.agent || "unknown",
    status: normalizeLocalRunStatus(run.status),
    prompt: run.prompt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    workspace: run.workspace,
    ...(bridgeRecord?.taskId ? { bridgedTaskId: bridgeRecord.taskId } : {}),
    ...(bridgeRecord?.taskRunId ? { bridgedTaskRunId: bridgeRecord.taskRunId } : {}),
  };
}

async function runDevshJson<T>(args: string[]): Promise<T> {
  const devshPath = process.env.DEVSH_PATH || "devsh";
  const result = await execa(devshPath, args, { timeout: 10000 });
  return JSON.parse(result.stdout) as T;
}

async function getLocalLaunchBridgeMap(
  accessToken: string,
  teamSlugOrId: string,
): Promise<Map<string, LocalClaudeLaunchRecord>> {
  const convex = getConvex({ accessToken });
  const launches = (await convex.query(api.localClaudeLaunches.list, {
    teamSlugOrId,
    limit: 20,
  })) as LocalClaudeLaunchRecord[];

  return buildLocalRunBridgeMap(launches);
}

function isRunNotFoundError(message: string) {
  return (
    message.includes("no run found") ||
    message.includes("run directory not found") ||
    message.includes("could not find run")
  );
}

function isRunUnavailableError(message: string) {
  return (
    message.includes("already completed") ||
    message.includes("already failed") ||
    message.includes("already ") ||
    message.includes("no pid.txt") ||
    message.includes("stale") ||
    message.includes("cannot inject into finished task")
  );
}

async function updateLocalLaunchContinuationMetadata(input: {
  accessToken: string;
  teamSlugOrId: string;
  orchestrationId: string;
  sessionId?: string;
  injectionMode?: string;
  injectionCount?: number;
  checkpointRef?: string;
  checkpointGeneration?: number;
  checkpointLabel?: string;
  checkpointCreatedAt?: number;
}) {
  const convex = getConvex({ accessToken: input.accessToken });
  await convex.mutation(api.localClaudeLaunches.updateMetadataByOrchestrationId, {
    teamSlugOrId: input.teamSlugOrId,
    orchestrationId: input.orchestrationId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.injectionMode ? { injectionMode: input.injectionMode } : {}),
    ...(typeof input.injectionCount === "number"
      ? { injectionCount: input.injectionCount }
      : {}),
    ...(input.checkpointRef ? { checkpointRef: input.checkpointRef } : {}),
    ...(typeof input.checkpointGeneration === "number"
      ? { checkpointGeneration: input.checkpointGeneration }
      : {}),
    ...(input.checkpointLabel ? { checkpointLabel: input.checkpointLabel } : {}),
    ...(typeof input.checkpointCreatedAt === "number"
      ? { checkpointCreatedAt: input.checkpointCreatedAt }
      : {}),
  });
}

async function requireLocalRouteAccess(request: Request, teamSlugOrId: string) {
  const accessToken = await getAccessTokenFromRequest(request);
  if (!accessToken) {
    return { error: { status: 401 as const, body: { error: "Unauthorized" } } };
  }

  try {
    await verifyTeamAccess({
      req: request,
      accessToken,
      teamSlugOrId,
    });
  } catch (error) {
    const mapped = mapDomainError(error);
    if (mapped?.status === 403) {
      return { error: { status: 403 as const, body: { error: mapped.message } } };
    }
    return {
      error: {
        status: 500 as const,
        body: {
          error: "Failed to verify team access",
          details: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }

  return { accessToken };
}

/**
 * POST /api/orchestrate/spawn-local
 */
orchestrateLocalSpawnRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/spawn-local",
    tags: ["Orchestration"],
    summary: "Spawn a local agent run",
    description:
      "Spawn an agent task in the local workspace using devsh orchestrate run-local. " +
      "The run executes in the current environment without a remote sandbox.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: LocalSpawnRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Local run spawned successfully",
        content: {
          "application/json": {
            schema: LocalSpawnResponseSchema,
          },
        },
      },
      400: {
        description: "Invalid request",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      500: {
        description: "Failed to spawn local run",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const access = await requireLocalRouteAccess(c.req.raw, body.teamSlugOrId);
    if ("error" in access) {
      return c.json(access.error.body, access.error.status);
    }

    const orchestrationId = buildLocalRouteOrchestrationId();
    const runDir = buildLocalRunArtifactsDir(orchestrationId);
    const args = [
      "orchestrate",
      "run-local",
      "--json",
      "--persist",
      "--agent",
      body.agent,
      "--orchestration-id",
      orchestrationId,
    ];

    if (body.workspace) {
      args.push("--workspace", body.workspace);
    }

    if (body.timeout) {
      args.push("--timeout", body.timeout);
    }

    args.push(body.prompt);

    try {
      const devshPath = process.env.DEVSH_PATH || "devsh";
      const child = execa(devshPath, args, {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          DEVSH_OUTPUT_FORMAT: "json",
        },
      });

      void child.catch(() => undefined);
      child.unref();

      const response: LocalSpawnResponse = {
        venue: "local",
        orchestrationId,
        runId: orchestrationId,
        runDir,
        status: "running",
        routingReason: "Explicit local venue requested via UI.",
        capabilities: {
          continueSession: true,
          appendInstruction: true,
          createCheckpoint: true,
        },
        followUp: {
          statusId: orchestrationId,
          injectId: orchestrationId,
        },
      };

      return c.json(response, 200);
    } catch (error) {
      return c.json(
        {
          error: "Failed to spawn local run",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
);

/**
 * GET /api/orchestrate/list-local
 */
orchestrateLocalSpawnRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/list-local",
    tags: ["Orchestration"],
    summary: "List local agent runs",
    description:
      "List local agent runs managed by devsh orchestrate list-local. " +
      "These runs execute in the local workspace without a remote sandbox.",
    request: {
      query: z.object({
        teamSlugOrId: z.string().openapi({
          description: "Team slug or ID",
          example: "my-team",
        }),
        limit: z.coerce.number().int().positive().optional().default(10).openapi({
          description: "Maximum number of runs to return",
          example: 10,
        }),
        status: z.enum(["running", "completed", "failed"]).optional().openapi({
          description: "Filter by status",
          example: "running",
        }),
      }),
    },
    responses: {
      200: {
        description: "List of local runs",
        content: {
          "application/json": {
            schema: LocalRunsListResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      500: {
        description: "Failed to list local runs",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const access = await requireLocalRouteAccess(c.req.raw, query.teamSlugOrId);
    if ("error" in access) {
      return c.json(access.error.body, access.error.status);
    }

    const args = ["orchestrate", "list-local", "--json", "--limit", String(query.limit)];
    if (query.status) {
      args.push("--status", query.status);
    }

    try {
      const [parsed, bridgeMap] = await Promise.all([
        z.array(RawLocalRunSchema).parse(await runDevshJson<unknown>(args)),
        getLocalLaunchBridgeMap(access.accessToken, query.teamSlugOrId),
      ]);
      const normalizedRuns = parsed.map((run) =>
        normalizeLocalRun(
          run,
          run.orchestrationId ? bridgeMap.get(run.orchestrationId) : undefined,
        ),
      );
      const response: LocalRunsListResponse = {
        runs: normalizedRuns,
        count: normalizedRuns.length,
      };
      return c.json(response, 200);
    } catch (error) {
      return c.json(
        {
          error: "Failed to list local runs",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
);

/**
 * GET /api/orchestrate/local-runs/:runId
 */
orchestrateLocalSpawnRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/orchestrate/local-runs/{runId}",
    tags: ["Orchestration"],
    summary: "Get local run detail",
    request: {
      params: z.object({
        runId: z.string().openapi({ description: "Local run ID" }),
      }),
      query: z.object({
        teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
        logs: z.coerce.boolean().optional().default(false).openapi({
          description: "Include stdout and stderr snapshots",
        }),
        events: z.coerce.boolean().optional().default(false).openapi({
          description: "Include event timeline",
        }),
      }),
    },
    responses: {
      200: {
        description: "Local run detail",
        content: {
          "application/json": {
            schema: LocalRunDetailSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      404: {
        description: "Run not found",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      500: {
        description: "Failed to load local run detail",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const query = c.req.valid("query");
    const access = await requireLocalRouteAccess(c.req.raw, query.teamSlugOrId);
    if ("error" in access) {
      return c.json(access.error.body, access.error.status);
    }

    const args = ["orchestrate", "show-local", runId, "--json"];
    if (query.logs) {
      args.push("--logs");
    }
    if (query.events) {
      args.push("--events");
    }

    try {
      const detail = LocalRunDetailSchema.parse(await runDevshJson<unknown>(args));
      const bridgeRecord = await getLocalLaunchBridgeRecord(
        access.accessToken,
        query.teamSlugOrId,
        runId,
      );
      return c.json(
        {
          ...detail,
          ...(bridgeRecord?.taskId ? { bridgedTaskId: bridgeRecord.taskId } : {}),
          ...(bridgeRecord?.taskRunId ? { bridgedTaskRunId: bridgeRecord.taskRunId } : {}),
        },
        200,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRunNotFoundError(message)) {
        return c.json({ error: "Local run not found", details: message }, 404);
      }
      return c.json({ error: "Failed to load local run detail", details: message }, 500);
    }
  },
);

/**
 * POST /api/orchestrate/local-runs/:runId/inject
 */
orchestrateLocalSpawnRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/local-runs/{runId}/inject",
    tags: ["Orchestration"],
    summary: "Inject follow-up instruction into a local run",
    request: {
      params: z.object({
        runId: z.string().openapi({ description: "Local run ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: LocalRunInjectRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Instruction queued successfully",
        content: {
          "application/json": {
            schema: LocalRunInjectResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      404: {
        description: "Run not found",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      409: {
        description: "Run cannot accept instructions",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      500: {
        description: "Failed to inject instruction",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLocalRouteAccess(c.req.raw, body.teamSlugOrId);
    if ("error" in access) {
      return c.json(access.error.body, access.error.status);
    }

    try {
      const result = LocalRunInjectResponseSchema.parse(
        await runDevshJson<unknown>(["orchestrate", "inject-local", runId, body.message, "--json"]),
      );
      await updateLocalLaunchContinuationMetadata({
        accessToken: access.accessToken,
        teamSlugOrId: body.teamSlugOrId,
        orchestrationId: runId,
        sessionId: result.sessionId,
        injectionMode: result.mode,
        injectionCount: result.injectionCount,
      });
      return c.json(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRunNotFoundError(message)) {
        return c.json({ error: "Local run not found", details: message }, 404);
      }
      if (isRunUnavailableError(message)) {
        return c.json({ error: "Local run inject is unavailable", details: message }, 409);
      }
      return c.json({ error: "Failed to inject instruction", details: message }, 500);
    }
  },
);

/**
 * POST /api/orchestrate/local-runs/:runId/resume
 */
orchestrateLocalSpawnRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/local-runs/{runId}/resume",
    tags: ["Orchestration"],
    summary: "Resume a checkpoint-backed local run",
    request: {
      params: z.object({
        runId: z.string().openapi({ description: "Local run ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: LocalRunInjectRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Local run resume queued successfully",
        content: {
          "application/json": {
            schema: LocalRunInjectResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      404: {
        description: "Run not found",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      409: {
        description: "Run cannot be resumed",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      500: {
        description: "Failed to resume local run",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLocalRouteAccess(c.req.raw, body.teamSlugOrId);
    if ("error" in access) {
      return c.json(access.error.body, access.error.status);
    }

    try {
      const result = LocalRunInjectResponseSchema.parse(
        await runDevshJson<unknown>([
          "orchestrate",
          "resume-local",
          runId,
          ...(body.message ? [body.message] : []),
          "--json",
        ]),
      );
      await updateLocalLaunchContinuationMetadata({
        accessToken: access.accessToken,
        teamSlugOrId: body.teamSlugOrId,
        orchestrationId: runId,
        sessionId: result.sessionId,
        checkpointRef: result.checkpointRef,
        checkpointGeneration: result.checkpointGeneration,
      });
      return c.json(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRunNotFoundError(message)) {
        return c.json({ error: "Local run not found", details: message }, 404);
      }
      if (isRunUnavailableError(message)) {
        return c.json({ error: "Local run resume is unavailable", details: message }, 409);
      }
      return c.json({ error: "Failed to resume local run", details: message }, 500);
    }
  },
);

/**
 * POST /api/orchestrate/local-runs/:runId/checkpoint
 */
orchestrateLocalSpawnRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/local-runs/{runId}/checkpoint",
    tags: ["Orchestration"],
    summary: "Create a checkpoint for a local run",
    request: {
      params: z.object({
        runId: z.string().openapi({ description: "Local run ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: LocalRunCheckpointRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Checkpoint created successfully",
        content: {
          "application/json": {
            schema: LocalRunCheckpointResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      404: {
        description: "Run not found",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      500: {
        description: "Failed to create checkpoint",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLocalRouteAccess(c.req.raw, body.teamSlugOrId);
    if ("error" in access) {
      return c.json(access.error.body, access.error.status);
    }

    try {
      const result = LocalRunCheckpointResponseSchema.parse(
        await runDevshJson<unknown>([
          "orchestrate",
          "checkpoint",
          "--json",
          "--local-run",
          runId,
          ...(body.label ? ["--label", body.label] : []),
        ]),
      );
      await updateLocalLaunchContinuationMetadata({
        accessToken: access.accessToken,
        teamSlugOrId: body.teamSlugOrId,
        orchestrationId: runId,
        checkpointRef: result.checkpointRef,
        checkpointGeneration: result.checkpointGeneration,
        checkpointLabel: result.label,
        checkpointCreatedAt: Date.parse(result.createdAt),
      });
      return c.json(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRunNotFoundError(message)) {
        return c.json({ error: "Local run not found", details: message }, 404);
      }
      return c.json({ error: "Failed to create checkpoint", details: message }, 500);
    }
  },
);

/**
 * POST /api/orchestrate/local-runs/:runId/stop
 */
orchestrateLocalSpawnRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/orchestrate/local-runs/{runId}/stop",
    tags: ["Orchestration"],
    summary: "Stop a local run",
    request: {
      params: z.object({
        runId: z.string().openapi({ description: "Local run ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: LocalRunStopRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Local run stopped successfully",
        content: {
          "application/json": {
            schema: LocalRunStopResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      404: {
        description: "Run not found",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      409: {
        description: "Run cannot be stopped",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
      500: {
        description: "Failed to stop local run",
        content: {
          "application/json": {
            schema: LocalSpawnErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { runId } = c.req.valid("param");
    const body = c.req.valid("json");
    const access = await requireLocalRouteAccess(c.req.raw, body.teamSlugOrId);
    if ("error" in access) {
      return c.json(access.error.body, access.error.status);
    }

    const args = ["orchestrate", "stop-local", runId, "--json"];
    if (body.force) {
      args.push("--force");
    }

    try {
      const result = LocalRunStopResponseSchema.parse(await runDevshJson<unknown>(args));
      return c.json(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRunNotFoundError(message)) {
        return c.json({ error: "Local run not found", details: message }, 404);
      }
      if (isRunUnavailableError(message)) {
        return c.json({ error: "Local run stop is unavailable", details: message }, 409);
      }
      return c.json({ error: "Failed to stop local run", details: message }, 500);
    }
  },
);
