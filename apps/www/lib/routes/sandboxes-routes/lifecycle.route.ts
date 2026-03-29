/**
 * Sandbox Lifecycle Routes
 *
 * Endpoints for managing sandbox lifecycle:
 * - POST /sandboxes/{id}/stop - Stop/pause a sandbox
 * - GET /sandboxes/{id}/status - Get sandbox status
 * - POST /sandboxes/{id}/resume - Resume a paused sandbox
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  z,
  getAccessTokenFromRequest,
  getUserFromRequest,
  getConvex,
  verifyTeamAccess,
  api,
  isPveLxcInstanceId,
  getInstanceById,
  tryGetInstanceById,
  getPveLxcClient,
  type Id,
} from "./_helpers";
import { getMorphClient, getMorphClientOrNull, verifyInstanceOwnership } from "./_helpers";
import { waitForPveExecReady } from "../pve-lxc.resume.helpers";

export const sandboxesLifecycleRouter = new OpenAPIHono();

// ============================================================================
// Schemas
// ============================================================================

const SandboxResumeResponse = z
  .object({
    resumed: z.literal(true),
  })
  .openapi("SandboxResumeResponse");

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /sandboxes/{id}/stop
 * Stop or pause a sandbox instance.
 */
sandboxesLifecycleRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/stop",
    tags: ["Sandboxes"],
    summary: "Stop or pause a sandbox instance",
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      204: { description: "Sandbox stopped" },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
      500: { description: "Failed to stop sandbox" },
    },
  }),
  async (c) => {
    const id = c.req.valid("param").id;
    const token = await getAccessTokenFromRequest(c.req.raw);
    if (!token) return c.text("Unauthorized", 401);

    try {
      // Get instance via provider dispatch and pause it
      // Morph preserves RAM state; PVE LXC pause() stops the container
      const instance = await tryGetInstanceById(
        id,
        getMorphClientOrNull(),
        "sandboxes.stop"
      );
      if (!instance) {
        // Instance doesn't exist - treat as already stopped (idempotent)
        console.warn(`[sandboxes.stop] Instance ${id} already stopped or deleted`);
        return c.body(null, 204);
      }
      await instance.pause();
      if (isPveLxcInstanceId(id)) {
        console.log(`[sandboxes.stop] PVE LXC container ${id} stopped`);
      }
      return c.body(null, 204);
    } catch (error) {
      console.error("Failed to stop sandbox:", error);
      return c.text("Failed to stop sandbox", 500);
    }
  },
);

/**
 * GET /sandboxes/{id}/status
 * Get sandbox status and URLs.
 */
sandboxesLifecycleRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/sandboxes/{id}/status",
    tags: ["Sandboxes"],
    summary: "Get sandbox status and URLs",
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              running: z.boolean(),
              vscodeUrl: z.string().optional(),
              vncUrl: z.string().optional(),
              workerUrl: z.string().optional(),
              provider: z.enum(["morph", "pve-lxc"]).optional(),
            }),
          },
        },
        description: "Sandbox status",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to get status" },
    },
  }),
  async (c) => {
    const id = c.req.valid("param").id;
    const token = await getAccessTokenFromRequest(c.req.raw);
    if (!token) return c.text("Unauthorized", 401);
    try {
      // Get instance via provider dispatch
      const isPveLxc = isPveLxcInstanceId(id);
      const instance = await getInstanceById(id, getMorphClientOrNull());
      const vscodeService = instance.networking.httpServices.find(
        (s) => s.port === 39378,
      );
      const vncService = instance.networking.httpServices.find(
        (s) => s.port === 39380,
      );
      // PVE-LXC uses port 39376 for Node.js worker (Go worker uses 39377)
      // Morph uses port 39377 for Node.js worker
      const workerPort = isPveLxc ? 39376 : 39377;
      const workerService = instance.networking.httpServices.find(
        (s) => s.port === workerPort,
      );
      const running = isPveLxc
        ? instance.status === "running" && Boolean(vscodeService)
        : Boolean(vscodeService);
      return c.json({
        running,
        vscodeUrl: vscodeService?.url,
        vncUrl: vncService?.url,
        workerUrl: workerService?.url,
        provider: isPveLxc ? ("pve-lxc" as const) : ("morph" as const),
      });
    } catch (error) {
      console.error("Failed to get sandbox status:", error);
      return c.text("Failed to get status", 500);
    }
  },
);

/**
 * POST /sandboxes/{id}/resume
 * Resume a paused sandbox.
 */
sandboxesLifecycleRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/resume",
    tags: ["Sandboxes"],
    summary: "Resume a paused sandbox",
    description: "Resumes a paused sandbox so it can accept SSH connections.",
    request: {
      params: z.object({ id: z.string() }),
      query: z.object({
        teamSlugOrId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: SandboxResumeResponse,
          },
        },
        description: "Sandbox resumed successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden - not a team member" },
      404: { description: "Sandbox not found" },
      500: { description: "Failed to resume sandbox" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("query");

    try {
      const convex = getConvex({ accessToken });

      // Determine provider based on instance ID prefix
      const isPveLxc = isPveLxcInstanceId(id);
      const isMorphVm = id.startsWith("morphvm_");

      if (isPveLxc) {
        // PVE LXC instance - resume directly
        // Note: LXC doesn't support hibernate, so "paused" containers are actually "stopped"
        const pveClient = getPveLxcClient();
        const pveLxcInstance = await pveClient.instances.get({ instanceId: id });

        if (pveLxcInstance.status !== "running") {
          await pveLxcInstance.resume();
          console.log(`[sandboxes.resume] PVE LXC container ${id} started`);
        }
        await waitForPveExecReady(pveLxcInstance);

        // Record resume activity for PVE LXC instance
        if (teamSlugOrId) {
          try {
            await convex.mutation(api.sandboxInstances.recordResume, {
              instanceId: id,
              teamSlugOrId,
            });
          } catch (recordError) {
            // Don't fail the resume if recording fails
            console.error("[sandboxes.resume] Failed to record PVE LXC resume activity:", recordError);
          }
        }

        return c.json({ resumed: true });
      }

      let morphInstanceId: string | null = null;

      // Check if the id is a direct VM ID
      if (isMorphVm) {
        // Direct Morph instance ID - verify ownership via instance metadata
        const morphClient = getMorphClient();

        // First try to find in task runs if team is provided
        if (teamSlugOrId) {
          let taskRun = null;
          try {
            taskRun = await convex.query(api.taskRuns.getByContainerName, {
              teamSlugOrId,
              containerName: id,
            });
          } catch (convexError) {
            console.log(
              `[sandboxes.resume] Convex query failed for ${id}:`,
              convexError,
            );
          }

          if (taskRun) {
            // Found in task runs - verify team access
            await verifyTeamAccess({
              req: c.req.raw,
              teamSlugOrId,
            });
            morphInstanceId = id;
          }
        }

        // If not found via task run, verify ownership via instance metadata
        if (!morphInstanceId) {
          const result = await verifyInstanceOwnership(
            morphClient,
            id,
            user.id,
            async () => {
              const memberships = await convex.query(api.teams.listTeamMemberships, {});
              return memberships.map((m) => ({ teamId: m.team.teamId }));
            }
          );
          if (!result.authorized) {
            return c.text(result.message, result.status);
          }
          morphInstanceId = result.instanceId;
        }
      } else {
        // Task-run ID - team is required
        if (!teamSlugOrId) {
          return c.text("teamSlugOrId is required for task-run IDs", 400);
        }

        await verifyTeamAccess({
          req: c.req.raw,
          teamSlugOrId,
        });

        const taskRun = await convex.query(api.taskRuns.get, {
          teamSlugOrId,
          id: id as Id<"taskRuns">,
        });

        if (!taskRun || !taskRun.vscode?.containerName) {
          return c.text("Sandbox not found", 404);
        }

        // Handle PVE LXC via task run lookup
        // Note: LXC doesn't support hibernate, so "paused" containers are actually "stopped"
        if (taskRun.vscode.provider === "pve-lxc") {
          const pveClient = getPveLxcClient();
          const pveLxcInstance = await pveClient.instances.get({ instanceId: taskRun.vscode.containerName });

          if (pveLxcInstance.status !== "running") {
            await pveLxcInstance.resume();
            console.log(`[sandboxes.resume] PVE LXC container ${taskRun.vscode.containerName} started`);
          }
          await waitForPveExecReady(pveLxcInstance);

          // Record resume activity for PVE LXC instance
          try {
            await convex.mutation(api.sandboxInstances.recordResume, {
              instanceId: taskRun.vscode.containerName,
              teamSlugOrId,
            });
          } catch (recordError) {
            console.error("[sandboxes.resume] Failed to record PVE LXC resume activity:", recordError);
          }

          return c.json({ resumed: true });
        }

        if (taskRun.vscode.provider !== "morph") {
          return c.text("Sandbox type not supported", 404);
        }

        morphInstanceId = taskRun.vscode.containerName;
      }

      if (!morphInstanceId) {
        return c.text("Could not resolve sandbox instance", 404);
      }

      // Resume the instance using Morph API
      const morphClient = getMorphClient();
      const instance = await morphClient.instances.get({ instanceId: morphInstanceId });

      if (instance.status !== "paused") {
        // Already running, just return success
        return c.json({ resumed: true });
      }

      await instance.resume();

      // Morph preserves RAM state on pause/resume, so all processes (including agent sessions)
      // should resume exactly where they left off. No need to restart services.

      // Record the resume for activity tracking (used by cleanup cron)
      // Get teamSlugOrId from request or fall back to instance metadata
      const instanceMetadata = instance.metadata as Record<string, unknown> | undefined;
      const effectiveTeamSlugOrId = teamSlugOrId ?? (instanceMetadata?.teamId as string | undefined);
      if (effectiveTeamSlugOrId && morphInstanceId) {
        try {
          // Record resume activity for cleanup cron
          await convex.mutation(api.sandboxInstances.recordResume, {
            instanceId: morphInstanceId,
            teamSlugOrId: effectiveTeamSlugOrId,
          });
        } catch (recordError) {
          // Don't fail the resume if recording fails
          console.error("[sandboxes.resume] Failed to record resume activity:", recordError);
        }
      }

      return c.json({ resumed: true });
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.text(error.message || "Request failed", error.status);
      }
      console.error("[sandboxes.resume] Failed to resume sandbox:", error);
      return c.text("Failed to resume sandbox", 500);
    }
  },
);
