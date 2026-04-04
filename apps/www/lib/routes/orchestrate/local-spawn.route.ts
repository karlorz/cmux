/**
 * Local Spawn Route
 *
 * Enables spawning local agent runs via `devsh orchestrate run-local`.
 * This bridges the UI to the MCP server's local execution lane.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { execa } from "execa";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

export const orchestrateLocalSpawnRouter = new OpenAPIHono();

type LocalRunStatus = "running" | "completed" | "failed" | "unknown";

function buildLocalRouteOrchestrationId(): string {
  return `local_www_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function buildLocalRunArtifactsDir(orchestrationId: string): string {
  return path.join(os.homedir(), ".devsh", "orchestrations", orchestrationId);
}

function normalizeLocalRun(
  run: {
    orchestrationId?: string;
    runDir?: string;
    agent?: string;
    status?: string;
    prompt?: string;
    startedAt?: string;
    completedAt?: string;
    workspace?: string;
  },
) : {
  orchestrationId: string;
  runDir?: string;
  agent: string;
  status: LocalRunStatus;
  prompt?: string;
  startedAt?: string;
  completedAt?: string;
  workspace?: string;
} {
  const orchestrationId = run.orchestrationId || "unknown";
  const status: LocalRunStatus =
    run.status === "running" ||
    run.status === "completed" ||
    run.status === "failed"
      ? run.status
      : "unknown";

  return {
    orchestrationId,
    runDir: run.runDir,
    agent: run.agent || "unknown",
    status,
    prompt: run.prompt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    workspace: run.workspace,
  };
}

// ============================================================================
// Schemas
// ============================================================================

const LocalSpawnRequestSchema = z
  .object({
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
    capabilities: z
      .object({
        continueSession: z.boolean(),
        appendInstruction: z.boolean(),
        createCheckpoint: z.boolean(),
      })
      .openapi({
        description: "Available post-launch control capabilities",
      }),
    followUp: z
      .object({
        statusId: z.string(),
        injectId: z.string(),
      })
      .openapi({
        description: "IDs to use for follow-up operations",
      }),
  })
  .openapi("LocalSpawnResponse");

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
  })
  .openapi("LocalRun");

const LocalRunsListResponseSchema = z
  .object({
    runs: z.array(LocalRunSchema),
    count: z.number(),
  })
  .openapi("LocalRunsListResponse");

type LocalSpawnResponse = z.infer<typeof LocalSpawnResponseSchema>;
type LocalRun = z.infer<typeof LocalRunSchema>;
type LocalRunsListResponse = z.infer<typeof LocalRunsListResponseSchema>;

// ============================================================================
// Route
// ============================================================================

/**
 * POST /api/orchestrate/spawn-local
 * Spawn a local agent run via devsh orchestrate run-local.
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
          // Ensure devsh uses JSON output
          DEVSH_OUTPUT_FORMAT: "json",
        },
      });

      if ("catch" in child && typeof child.catch === "function") {
        void child.catch(() => undefined);
      }
      if ("unref" in child && typeof child.unref === "function") {
        child.unref();
      }

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
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      return c.json(
        {
          error: "Failed to spawn local run",
          details: message,
        },
        500
      );
    }
  }
);

/**
 * GET /api/orchestrate/list-local
 * List local agent runs via devsh orchestrate list-local.
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
          description: "Team slug or ID (for consistency with other endpoints)",
          example: "my-team",
        }),
        limit: z.string().optional().openapi({
          description: "Maximum number of runs to return",
          example: "10",
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
    const limit = query.limit ? parseInt(query.limit, 10) : 10;

    const args = ["orchestrate", "list-local", "--json", "--limit", String(limit)];

    if (query.status) {
      args.push("--status", query.status);
    }

    try {
      const devshPath = process.env.DEVSH_PATH || "devsh";
      const result = await execa(devshPath, args, { timeout: 10000 });

      let runs: Array<{
        orchestrationId?: string;
        runDir?: string;
        agent?: string;
        status?: string;
        prompt?: string;
        startedAt?: string;
        completedAt?: string;
        workspace?: string;
      }> = [];

      try {
        const parsed = JSON.parse(result.stdout);
        runs = Array.isArray(parsed) ? parsed : [];
      } catch {
        runs = [];
      }

      const normalizedRuns: LocalRun[] = runs.map(normalizeLocalRun);
      const response: LocalRunsListResponse = {
        runs: normalizedRuns,
        count: normalizedRuns.length,
      };

      return c.json(response, 200);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      return c.json(
        {
          error: "Failed to list local runs",
          details: message,
        },
        500
      );
    }
  }
);
