import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { extractMorphInstanceInfo } from "@cmux/shared/utils/morph-instance";
import { HTTPException } from "hono/http-exception";
import { MorphCloudClient } from "morphcloud";

const INSTANCE_READY_TIMEOUT_MS = 2 * 60 * 1000;

const ForceWakeResponseSchema = z
  .object({
    instanceId: z.string(),
    status: z.enum(["already_ready", "resumed"]),
  })
  .openapi("ForceWakeVmResponse");

const ForceWakeRequestBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("ForceWakeVmBody");

export const taskRunsRouter = new OpenAPIHono();

taskRunsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/task-runs/{id}/force-wake",
    tags: ["TaskRuns"],
    summary: "Resume the Morph VM for a task run if it is paused",
    request: {
      params: z.object({
        id: z.string().openapi({
          description: "Task run ID",
          example: "taskRuns_01hxyz",
        }),
      }),
      body: {
        content: {
          "application/json": {
            schema: ForceWakeRequestBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "VM is ready",
        content: {
          "application/json": {
            schema: ForceWakeResponseSchema,
          },
        },
      },
      400: { description: "Task run is not backed by a Morph VM" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Failed to resume VM" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { id: taskRunId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");

    const team = await verifyTeamAccess({
      req: c.req.raw,
      accessToken,
      teamSlugOrId,
    });

    const convex = getConvex({ accessToken });
    const run = await convex.query(api.taskRuns.get, {
      teamSlugOrId,
      id: taskRunId as unknown as string & { __tableName: "taskRuns" },
    });

    if (!run) {
      return c.json({ error: "Task run not found" }, 404);
    }

    if (run.teamId !== team.uuid) {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (run.vscode?.provider !== "morph") {
      return c.json(
        { error: "Force wake is only available for Morph workspaces" },
        400,
      );
    }

    const workspaceCandidate =
      run.vscode?.workspaceUrl ??
      run.vscode?.url ??
      run.networking?.find((service) => service.port === 39378)?.url ??
      null;

    if (!workspaceCandidate) {
      return c.json(
        {
          error:
            "No Morph workspace URL is associated with this task run. Try reopening the workspace instead.",
        },
        400,
      );
    }

    const morphInfo = extractMorphInstanceInfo(workspaceCandidate);
    if (!morphInfo) {
      return c.json(
        {
          error:
            "Unable to derive Morph instance ID for this task run workspace.",
        },
        400,
      );
    }

    if (!env.MORPH_API_KEY) {
      throw new HTTPException(500, {
        message: "Morph API is not configured",
      });
    }

    try {
      const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
      const instance = await client.instances.get({
        instanceId: morphInfo.instanceId,
      });

      const instanceTeamId = instance.metadata?.teamId;
      if (instanceTeamId && instanceTeamId !== team.uuid) {
        return c.json(
          { error: "This Morph instance belongs to another team." },
          403,
        );
      }

      if (instance.status === "ready") {
        return c.json({
          instanceId: morphInfo.instanceId,
          status: "already_ready" as const,
        });
      }

      await instance.resume();
      await instance.waitUntilReady(INSTANCE_READY_TIMEOUT_MS);

      return c.json({
        instanceId: morphInfo.instanceId,
        status: "resumed" as const,
      });
    } catch (error) {
      console.error(
        `[task-runs.force-wake] Failed to resume Morph instance ${morphInfo.instanceId}`,
        error,
      );
      return c.json(
        {
          error: "Failed to resume Morph instance. Please try again shortly.",
        },
        500,
      );
    }
  },
);
