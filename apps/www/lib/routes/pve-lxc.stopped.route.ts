import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getConvex } from "../utils/get-convex";

const CheckTaskRunStoppedBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("PveLxcCheckTaskRunStoppedBody");

const CheckTaskRunStoppedResponse = z
  .object({
    stopped: z.boolean(),
    deleted: z.boolean().optional(),
  })
  .openapi("PveLxcCheckTaskRunStoppedResponse");

export const pveLxcStoppedRouter = new OpenAPIHono();

pveLxcStoppedRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/task-runs/{taskRunId}/is-stopped",
    tags: ["PVE LXC"],
    summary: "Check if the PVE LXC container backing a task run is stopped",
    request: {
      params: z.object({
        taskRunId: typedZid("taskRuns"),
      }),
      body: {
        content: {
          "application/json": {
            schema: CheckTaskRunStoppedBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: CheckTaskRunStoppedResponse,
          },
        },
        description: "PVE LXC container status returned",
      },
      400: { description: "Task run is not backed by a PVE LXC container" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Failed to check container status" },
      503: { description: "PVE LXC provider not configured" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
      return c.text("PVE LXC provider not configured", 503);
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
    const isPveLxcProvider = taskRun.vscode?.provider === "pve-lxc";

    if (!isPveLxcProvider || !instanceId) {
      return c.text("Task run is not backed by a PVE LXC container", 400);
    }

    try {
      const activity = await convex.query(api.sandboxInstances.getActivity, {
        instanceId,
      });
      if (!activity || !activity.teamId) {
        return c.text("Sandbox not found", 404);
      }
      if (activity.teamId !== team.uuid) {
        return c.text("Forbidden", 403);
      }

      const client = getPveLxcClient();

      let instance;
      try {
        instance = await client.instances.get({ instanceId });
      } catch (instanceError) {
        const errorMessage = instanceError instanceof Error ? instanceError.message : String(instanceError);
        if (errorMessage.includes("404") || errorMessage.includes("not found")) {
          return c.json({
            stopped: true,
            deleted: true,
          });
        }
        throw instanceError;
      }

      const metadataTeamId = instance.metadata?.teamId;
      if (metadataTeamId && metadataTeamId !== team.uuid) {
        return c.text("Forbidden", 403);
      }

      return c.json({
        stopped: instance.status === "stopped",
        deleted: false,
      });
    } catch (error) {
      console.error(
        "[pve-lxc.check-task-run-stopped] Failed to check container status",
        error
      );
      return c.text("Failed to check container status", 500);
    }
  }
);
