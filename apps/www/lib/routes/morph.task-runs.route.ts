import { generateGitHubInstallationToken } from "@/lib/utils/github-app-token";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type Instance, MorphCloudClient } from "morphcloud";
import { getAccessTokenFromRequest } from "../utils/auth";
import { getConvex } from "../utils/get-convex";
import { stackServerAppJs } from "../utils/stack";
import { configureGithubAccess, getFreshGitHubToken } from "./sandboxes/git";
import { wrapMorphInstance } from "@/lib/utils/sandbox-instance";

const ResumeTaskRunBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("ResumeTaskRunBody");

const CheckTaskRunPausedBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("CheckTaskRunPausedBody");

const ResumeTaskRunResponse = z
  .object({
    resumed: z.literal(true),
  })
  .openapi("ResumeTaskRunResponse");

const CheckTaskRunPausedResponse = z
  .object({
    paused: z.boolean(),
    stopped: z.boolean().optional(),
    stoppedAt: z.number().optional(),
  })
  .openapi("CheckTaskRunPausedResponse");

const RefreshGitHubAuthBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("RefreshGitHubAuthBody");

const RefreshGitHubAuthResponse = z
  .object({
    refreshed: z.literal(true),
  })
  .openapi("RefreshGitHubAuthResponse");

export const morphTaskRunsRouter = new OpenAPIHono();

morphTaskRunsRouter.openapi(
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
  }
);

morphTaskRunsRouter.openapi(
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
      console.error(
        "[morph.check-task-run-paused] Failed to check instance status",
        error,
      );
      return c.text("Failed to check instance status", 500);
    }
  }
);

morphTaskRunsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/morph/task-runs/{taskRunId}/refresh-github-auth",
    tags: ["Morph"],
    summary: "Refresh GitHub authentication on a Morph instance",
    description:
      "Re-authenticates the GitHub CLI inside a running Morph VM with a fresh token. " +
      "Useful when the token has expired or the user has re-connected their GitHub account.",
    request: {
      params: z.object({
        taskRunId: typedZid("taskRuns"),
      }),
      body: {
        content: {
          "application/json": {
            schema: RefreshGitHubAuthBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RefreshGitHubAuthResponse,
          },
        },
        description: "GitHub authentication refreshed successfully",
      },
      400: { description: "Task run is not backed by a Morph instance" },
      401: { description: "Unauthorized or GitHub not connected" },
      403: { description: "Forbidden - instance does not belong to this team" },
      404: { description: "Task run not found" },
      409: { description: "Instance is paused - resume it first" },
      500: { description: "Failed to refresh GitHub authentication" },
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

      const metadataTeamId = (
        instance as unknown as {
          metadata?: { teamId?: string };
        }
      ).metadata?.teamId;

      if (metadataTeamId && metadataTeamId !== team.uuid) {
        return c.text("Forbidden", 403);
      }

      if (instance.status === "paused") {
        return c.text("Instance is paused - resume it first", 409);
      }

      let gitAuthToken: string | undefined;

      const task = await convex.query(api.tasks.getById, {
        teamSlugOrId,
        id: taskRun.taskId,
      });

      if (task?.projectFullName) {
        const [owner] = task.projectFullName.split("/");
        try {
          const connections = await convex.query(api.github.listProviderConnections, {
            teamSlugOrId,
          });
          const targetConnection = connections.find(
            (co) =>
              co.isActive && co.accountLogin?.toLowerCase() === owner.toLowerCase(),
          );
          if (targetConnection) {
            console.log(
              `[morph.refresh-github-auth] Found GitHub App installation ${targetConnection.installationId} for ${owner}`,
            );
            gitAuthToken = await generateGitHubInstallationToken({
              installationId: targetConnection.installationId,
              repositories: [task.projectFullName],
              permissions: {
                contents: "write",
                metadata: "read",
                workflows: "write",
                pull_requests: "write",
              },
            });
            console.log(
              "[morph.refresh-github-auth] Using GitHub App token for git authentication",
            );
          }
        } catch (error) {
          console.error(
            "[morph.refresh-github-auth] Failed to get GitHub App token, falling back to user OAuth:",
            error,
          );
        }
      }

      if (!gitAuthToken) {
        const tokenResult = await getFreshGitHubToken(user);
        if ("error" in tokenResult) {
          return c.text(tokenResult.error, tokenResult.status);
        }
        gitAuthToken = tokenResult.token;
        console.log(
          "[morph.refresh-github-auth] Using personal OAuth token for git authentication",
        );
      }

      await configureGithubAccess(wrapMorphInstance(instance), gitAuthToken);

      console.log(
        `[morph.refresh-github-auth] Successfully refreshed GitHub auth for instance ${instanceId}`,
      );

      return c.json({ refreshed: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[morph.refresh-github-auth] Failed to refresh GitHub auth for ${instanceId}:`,
        errorMessage,
      );
      if (errorMessage.includes("exec failed") || errorMessage.includes("HTTP exec")) {
        return c.text("Instance exec service not reachable - instance may need restart", 503);
      }
      if (errorMessage.includes("not found") || errorMessage.includes("does not exist")) {
        return c.text("Instance not found or deleted", 404);
      }
      return c.text(`Failed to refresh GitHub authentication: ${errorMessage.slice(0, 200)}`, 500);
    }
  }
);
