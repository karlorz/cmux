import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type Instance, MorphCloudClient } from "morphcloud";
import { getAccessTokenFromRequest } from "../utils/auth";
import { getConvex } from "../utils/get-convex";

const CheckTaskRunPausedBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("CheckTaskRunPausedBody");

const CheckTaskRunPausedResponse = z
  .object({
    paused: z.boolean(),
    stopped: z.boolean().optional(),
    stoppedAt: z.number().optional(),
  })
  .openapi("CheckTaskRunPausedResponse");

export const morphTaskRunsPausedRouter = new OpenAPIHono();

morphTaskRunsPausedRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/morph/task-runs/{taskRunId}/is-paused",
    tags: ["Morph"],
    summary: "Check if the Morph instance backing a task run is paused",
    request: {
      params: z.object({
        taskRunId: typedZid("taskRuns"),
      }),
      body: {
        content: {
          "application/json": {
            schema: CheckTaskRunPausedBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: CheckTaskRunPausedResponse,
          },
        },
        description: "Morph instance status returned",
      },
      400: { description: "Task run is not backed by a Morph instance" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run or instance not found" },
      500: { description: "Failed to check instance status" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { taskRunId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");

    const convex = getConvex({ accessToken });
    const team = await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

    const taskRun = await convex.query(api.taskRuns.get, {
      teamSlugOrId,
      id: taskRunId,
    });

    if (!taskRun) {
      return c.text("Task run not found", 404);
    }

    const instanceId = taskRun.vscode?.containerName;
    const isMorphProvider = taskRun.vscode?.provider === "morph";

    if (!isMorphProvider || !instanceId) {
      return c.text("Task run is not backed by a Morph instance", 400);
    }

    try {
      const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });

      let instance: Instance;
      try {
        instance = await client.instances.get({ instanceId });
      } catch (instanceError) {
        const errorMessage = instanceError instanceof Error ? instanceError.message : String(instanceError);
        if (errorMessage.includes("404") || errorMessage.includes("not found")) {
          return c.json({
            paused: true,
            stopped: true,
            stoppedAt: undefined,
          });
        }
        throw instanceError;
      }

      const metadataTeamId = (
        instance as unknown as {
          metadata?: { teamId?: string };
        }
      ).metadata?.teamId;

      if (metadataTeamId && metadataTeamId !== team.uuid) {
        return c.text("Forbidden", 403);
      }

      return c.json({ paused: instance.status === "paused", stopped: false });
    } catch (error) {
      console.error("[morph.check-task-run-paused] Failed to check instance status", error);
      return c.text("Failed to check instance status", 500);
    }
  },
);
