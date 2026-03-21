import { wrapMorphInstance } from "@/lib/utils/sandbox-instance";
import { generateGitHubInstallationToken } from "@/lib/utils/github-app-token";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MorphCloudClient } from "morphcloud";
import { getConvex } from "../utils/get-convex";
import { stackServerAppJs } from "../utils/stack";
import { configureGithubAccess, getFreshGitHubToken } from "./sandboxes/git";

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

export const morphTaskRunsRefreshGitHubAuthRouter = new OpenAPIHono();

morphTaskRunsRefreshGitHubAuthRouter.openapi(
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
            (co) => co.isActive && co.accountLogin?.toLowerCase() === owner.toLowerCase(),
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
  },
);
