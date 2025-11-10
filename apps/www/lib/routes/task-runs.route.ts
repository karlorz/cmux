import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import {
  extractMorphInstanceInfo,
  type MorphInstanceInfo,
} from "@cmux/shared";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MorphCloudClient, type InstanceStatus } from "morphcloud";

const WAIT_UNTIL_READY_TIMEOUT_MS = 2 * 60 * 1000;

const ForceWakeVmParams = z
  .object({
    taskRunId: z.string().min(1),
  })
  .openapi("ForceWakeVmParams");

const ForceWakeVmBody = z
  .object({
    teamSlugOrId: z.string().min(1),
  })
  .openapi("ForceWakeVmBody");

const InstanceStatusSchema = z.enum([
  "pending",
  "ready",
  "paused",
  "saving",
  "error",
  "unknown",
]);

const ForceWakeVmResponse = z
  .object({
    instanceId: z.string(),
    outcome: z.enum(["already_running", "resumed"]),
    status: InstanceStatusSchema,
  })
  .openapi("ForceWakeVmResponse");

export const taskRunsRouter = new OpenAPIHono();

taskRunsRouter.openapi(
  createRoute({
    method: "post",
    path: "/task-runs/{taskRunId}/force-wake",
    tags: ["TaskRuns"],
    summary: "Force resume a Morph VS Code workspace for a task run",
    request: {
      params: ForceWakeVmParams,
      body: {
        content: {
          "application/json": {
            schema: ForceWakeVmBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Instance is ready",
        content: {
          "application/json": {
            schema: ForceWakeVmResponse,
          },
        },
      },
      400: { description: "Invalid request or non-Morph provider" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run or Morph instance not found" },
      500: { description: "Failed to resume Morph instance" },
    },
  }),
  async (c) => {
    const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { taskRunId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");
    const typedTaskRunId = typedZid("taskRuns").parse(taskRunId);

    const team = await verifyTeamAccess({
      accessToken,
      teamSlugOrId,
    });

    const convex = getConvex({ accessToken });

    const run = await convex.query(api.taskRuns.get, {
      teamSlugOrId,
      id: typedTaskRunId,
    });

    if (!run) {
      return c.json({ error: "Task run not found" }, 404);
    }

    if (!run.vscode || run.vscode.provider !== "morph") {
      return c.json(
        { error: "Force wake is only available for Morph-backed runs" },
        400,
      );
    }

    const morphInfo = resolveMorphInstanceInfo(run);
    if (!morphInfo) {
      return c.json(
        { error: "Unable to determine Morph workspace for this run" },
        400,
      );
    }

    const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });

    let instance;
    try {
      instance = await client.instances.get({
        instanceId: morphInfo.instanceId,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json(
          { error: "Workspace no longer exists in Morph" },
          404,
        );
      }
      console.error(
        "[task-runs.force-wake] Failed to load instance",
        error,
      );
      return c.json({ error: "Failed to load Morph workspace" }, 500);
    }

    const metadata = instance.metadata ?? {};
    const metadataUserId =
      typeof metadata.userId === "string" ? metadata.userId : null;
    if (metadataUserId && metadataUserId !== user.id) {
      return c.json(
        { error: "You do not own this workspace" },
        403,
      );
    }

    const metadataTeamId =
      typeof metadata.teamId === "string" ? metadata.teamId : null;
    if (metadataTeamId && metadataTeamId !== team.uuid) {
      return c.json(
        { error: "This workspace belongs to a different team" },
        403,
      );
    }

    const safeUpdateVSCodeStatus = async (
      status: "starting" | "running" | "stopped",
      stoppedAt?: number,
    ) => {
      try {
        await convex.mutation(api.taskRuns.updateVSCodeStatus, {
          teamSlugOrId,
          id: typedTaskRunId,
          status,
          ...(stoppedAt ? { stoppedAt } : {}),
        });
      } catch (error) {
        console.error(
          `[task-runs.force-wake] Failed to set VS Code status to ${status}`,
          error,
        );
      }
    };

    let finalStatus: InstanceStatus | "unknown" =
      instance.status ?? "unknown";
    let outcome: "already_running" | "resumed" = "already_running";

    if (instance.status !== "ready") {
      console.info(
        "[task-runs.force-wake] Resuming Morph instance",
        morphInfo.instanceId,
      );
      outcome = "resumed";
      await safeUpdateVSCodeStatus("starting");
      try {
        await instance.resume();
        await instance.waitUntilReady(WAIT_UNTIL_READY_TIMEOUT_MS);
        const refreshed = await client.instances.get({
          instanceId: morphInfo.instanceId,
        });
        finalStatus = refreshed.status ?? "unknown";
        if (finalStatus !== "ready") {
          await safeUpdateVSCodeStatus("stopped", Date.now());
          return c.json(
            {
              error: `Resume finished but workspace is ${finalStatus}`,
            },
            500,
          );
        }
        await safeUpdateVSCodeStatus("running");
      } catch (error) {
        await safeUpdateVSCodeStatus("stopped", Date.now());
        console.error(
          "[task-runs.force-wake] Failed to resume instance",
          error,
        );
        return c.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Failed to resume Morph instance",
          },
          500,
        );
      }
    } else if (run.vscode.status !== "running") {
      await safeUpdateVSCodeStatus("running");
    }

    return c.json({
      instanceId: morphInfo.instanceId,
      outcome,
      status: toSerializableInstanceStatus(finalStatus),
    });
  },
);

function resolveMorphInstanceInfo(
  run: Doc<"taskRuns">,
): MorphInstanceInfo | null {
  if (!run.vscode) {
    return null;
  }
  const candidates = [
    run.vscode.ports?.vscode,
    run.vscode.workspaceUrl,
    run.vscode.url,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const info = extractMorphInstanceInfo(candidate);
    if (info) {
      return info;
    }
  }
  return null;
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("404") || error.message.includes("Not Found"))
  );
}

function toSerializableInstanceStatus(
  status: InstanceStatus | "unknown",
): z.infer<typeof InstanceStatusSchema> {
  if (!status) {
    return "unknown";
  }
  switch (status) {
    case "pending":
    case "ready":
    case "paused":
    case "saving":
    case "error":
      return status;
    default:
      return "unknown";
  }
}
