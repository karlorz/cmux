import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { waitForPveExecReady } from "./pve-lxc.resume.helpers";
import { getConvex } from "../utils/get-convex";

const ResumeTaskRunBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("PveLxcResumeTaskRunBody");

const ResumeTaskRunResponse = z
  .object({
    resumed: z.literal(true),
  })
  .openapi("PveLxcResumeTaskRunResponse");

export const pveLxcResumeRouter = new OpenAPIHono();

pveLxcResumeRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/pve-lxc/task-runs/{taskRunId}/resume",
    tags: ["PVE LXC"],
    summary: "Resume the PVE LXC container backing a task run",
    request: {
      params: z.object({
        taskRunId: typedZid("taskRuns"),
      }),
      body: {
        content: {
          "application/json": {
            schema: ResumeTaskRunBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ResumeTaskRunResponse,
          },
        },
        description: "PVE LXC container resumed",
      },
      400: { description: "Task run is not backed by a PVE LXC container" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run or container not found" },
      500: { description: "Failed to resume container" },
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
      const instance = await client.instances.get({ instanceId });

      if (instance.status !== "running") {
        await instance.resume();
      }
      await waitForPveExecReady(instance);

      await convex.mutation(api.sandboxInstances.recordResume, {
        instanceId,
        teamSlugOrId,
      });

      await convex.mutation(api.taskRuns.updateVSCodeStatus, {
        teamSlugOrId,
        id: taskRunId as Id<"taskRuns">,
        status: "running",
      });

      return c.json({ resumed: true });
    } catch (error) {
      console.error("[pve-lxc.resume-task-run] Failed to resume container", error);
      return c.text("Failed to resume container", 500);
    }
  }
);
