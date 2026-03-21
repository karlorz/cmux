import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MorphCloudClient } from "morphcloud";
import { getAccessTokenFromRequest } from "../utils/auth";
import { getConvex } from "../utils/get-convex";

const ResumeTaskRunBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("ResumeTaskRunBody");

const ResumeTaskRunResponse = z
  .object({
    resumed: z.literal(true),
  })
  .openapi("ResumeTaskRunResponse");

export const morphTaskRunsResumeRouter = new OpenAPIHono();

morphTaskRunsResumeRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/morph/task-runs/{taskRunId}/resume",
    tags: ["Morph"],
    summary: "Resume the Morph instance backing a task run",
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
        description: "Morph instance resumed",
      },
      400: { description: "Task run is not backed by a Morph instance" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run or instance not found" },
      500: { description: "Failed to resume instance" },
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
      const instance = await client.instances.get({ instanceId });
      void (async () => {
        try {
          await instance.setWakeOn(true, true);
        } catch (error) {
          console.error("[morph.resume-task-run] Failed to set wake on", error);
        }
      })();

      const metadataTeamId = (
        instance as unknown as {
          metadata?: { teamId?: string };
        }
      ).metadata?.teamId;

      if (metadataTeamId && metadataTeamId !== team.uuid) {
        return c.text("Forbidden", 403);
      }

      await instance.resume();

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
      console.error("[morph.resume-task-run] Failed to resume instance", error);
      return c.text("Failed to resume instance", 500);
    }
  },
);
