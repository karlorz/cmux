/**
 * Orchestration Checkpoint Routes
 *
 * Checkpoint management endpoints:
 * - POST /v1/cmux/orchestration/checkpoint - Create a checkpoint
 * - GET /v1/cmux/orchestration/checkpoint/:taskId - List checkpoints for a task
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvexAdmin } from "@/lib/utils/get-convex";
import { internal } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { extractTeamFromJwt } from "./_helpers";

export const orchestrateCheckpointRouter = new OpenAPIHono();

// ============================================================================
// Schemas
// ============================================================================

const CreateCheckpointRequestSchema = z
  .object({
    teamSlugOrId: z.string().openapi({ description: "Team slug or ID" }),
    taskId: z.string().openapi({ description: "Task ID to checkpoint" }),
    label: z.string().optional().openapi({ description: "Optional label for the checkpoint" }),
  })
  .openapi("CreateCheckpointRequest");

const CheckpointResponseSchema = z
  .object({
    taskId: z.string(),
    checkpointRef: z.string(),
    checkpointGeneration: z.number(),
    label: z.string().optional(),
    createdAt: z.string(),
  })
  .openapi("CheckpointResponse");

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/orchestrate/checkpoint
 * Create a checkpoint of the current task state.
 */
orchestrateCheckpointRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/checkpoint",
    tags: ["Orchestration"],
    summary: "Create checkpoint",
    description: "Create a named checkpoint of the current task state for later resume.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreateCheckpointRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: CheckpointResponseSchema,
          },
        },
        description: "Checkpoint created successfully",
      },
      401: { description: "Unauthorized" },
      404: { description: "Task not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    let teamSlugOrId: string | undefined;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = extractTeamFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    const body = c.req.valid("json");
    teamSlugOrId = teamSlugOrId ?? body.teamSlugOrId;

    if (!teamSlugOrId) {
      return c.text("Unauthorized - no team context", 401);
    }

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      // Create checkpoint via Convex mutation
      const result = await adminClient.mutation(
        internal.taskRuns.createCheckpoint,
        {
          taskId: body.taskId as Id<"tasks">,
          label: body.label,
        }
      );

      if (!result) {
        return c.text("Task not found or not running", 404);
      }

      return c.json({
        taskId: body.taskId,
        checkpointRef: result.checkpointRef,
        checkpointGeneration: result.checkpointGeneration,
        label: body.label,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[orchestrate] Failed to create checkpoint:", error);
      return c.text("Failed to create checkpoint", 500);
    }
  }
);

/**
 * GET /api/orchestrate/checkpoint/:taskId
 * List checkpoints for a task.
 */
orchestrateCheckpointRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/checkpoint/{taskId}",
    tags: ["Orchestration"],
    summary: "List checkpoints",
    description: "List all checkpoints for a task.",
    request: {
      params: z.object({
        taskId: z.string().openapi({ description: "Task ID" }),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              taskId: z.string(),
              checkpoints: z.array(
                z.object({
                  checkpointRef: z.string(),
                  checkpointGeneration: z.number(),
                  label: z.string().optional(),
                  createdAt: z.number(),
                })
              ),
            }),
          },
        },
        description: "Checkpoints found",
      },
      401: { description: "Unauthorized" },
      404: { description: "Task not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const authHeader = c.req.header("Authorization");
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    let teamSlugOrId: string | undefined;

    if (!accessToken && authHeader?.startsWith("Bearer ")) {
      teamSlugOrId = extractTeamFromJwt(authHeader);
      if (!teamSlugOrId) {
        return c.text("Invalid JWT", 401);
      }
    }

    if (!teamSlugOrId) {
      return c.text("Unauthorized - no team context", 401);
    }

    const { taskId } = c.req.valid("param");

    try {
      const adminClient = getConvexAdmin();
      if (!adminClient) {
        return c.text("Server configuration error", 500);
      }

      const checkpoints = await adminClient.query(
        internal.taskRuns.listCheckpoints,
        { taskId: taskId as Id<"tasks"> }
      );

      if (!checkpoints) {
        return c.text("Task not found", 404);
      }

      return c.json({
        taskId,
        checkpoints,
      });
    } catch (error) {
      console.error("[orchestrate] Failed to list checkpoints:", error);
      return c.text("Failed to list checkpoints", 500);
    }
  }
);
