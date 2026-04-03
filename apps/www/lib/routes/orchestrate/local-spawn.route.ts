/**
 * Local Spawn Route
 *
 * Enables spawning local agent runs via `devsh orchestrate run-local`.
 * This bridges the UI to the MCP server's local execution lane.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { execa } from "execa";

export const orchestrateLocalSpawnRouter = new OpenAPIHono();

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
    runId: z.string().openapi({
      description: "Local run ID",
      example: "local_abc123",
    }),
    status: z.string().openapi({
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
    id: z.string(),
    runId: z.string().optional(),
    agent: z.string(),
    status: z.enum(["running", "completed", "failed", "unknown"]),
    prompt: z.string().optional(),
    createdAt: z.string().optional(),
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

    const args = [
      "orchestrate",
      "run-local",
      "--json",
      "--persist",
      "--agent",
      body.agent,
    ];

    if (body.workspace) {
      args.push("--workspace", body.workspace);
    }

    if (body.timeout) {
      args.push("--timeout", body.timeout);
    }

    args.push(body.prompt);

    try {
      // Spawn detached process
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

      // Unref to allow parent to exit
      child.unref();

      // Wait briefly for the process to start and create the run directory
      await new Promise((resolve) => setTimeout(resolve, 500));

      // List local runs to find the new one
      const listResult = await execa(devshPath, [
        "orchestrate",
        "list-local",
        "--json",
        "--limit",
        "1",
      ]);

      let runId = "local_unknown";
      try {
        const runs = JSON.parse(listResult.stdout);
        if (Array.isArray(runs) && runs.length > 0) {
          runId = runs[0].id || runs[0].runId || `local_${Date.now()}`;
        }
      } catch {
        runId = `local_${Date.now()}`;
      }

      return c.json(
        {
          venue: "local" as const,
          runId,
          status: "running",
          routingReason: "Explicit local venue requested via UI.",
          capabilities: {
            continueSession: true,
            appendInstruction: true,
            createCheckpoint: true,
          },
          followUp: {
            statusId: runId,
            injectId: runId,
          },
        },
        200
      );
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
        id?: string;
        runId?: string;
        agent?: string;
        status?: string;
        prompt?: string;
        createdAt?: string;
        completedAt?: string;
        workspace?: string;
      }> = [];

      try {
        const parsed = JSON.parse(result.stdout);
        runs = Array.isArray(parsed) ? parsed : [];
      } catch {
        runs = [];
      }

      const normalizedRuns = runs.map((run) => ({
        id: run.id || run.runId || "unknown",
        runId: run.runId,
        agent: run.agent || "unknown",
        status: (run.status as "running" | "completed" | "failed") || "unknown",
        prompt: run.prompt,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        workspace: run.workspace,
      }));

      return c.json(
        {
          runs: normalizedRuns,
          count: normalizedRuns.length,
        },
        200
      );
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
