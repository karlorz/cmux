/**
 * Project GitHub Refresh Route
 *
 * POST /api/projects/:id/refresh-github
 * Refreshes cached GitHub Project item counts.
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import {
  getProjectByNumber,
  getProjectItemCounts,
} from "@/lib/utils/github-projects";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

/**
 * Get user's GitHub OAuth access token with specified scopes.
 * Returns undefined if not available or missing scope.
 */
async function getUserOAuthAccessToken(
  req: Request,
  _scopes: string[]
): Promise<string | undefined> {
  try {
    const user = await stackServerAppJs.getUser({ tokenStore: req });
    if (!user) return undefined;

    const githubAccount = await user.getConnectedAccount("github");
    if (!githubAccount) return undefined;

    const { accessToken } = await githubAccount.getAccessToken();
    if (!accessToken || accessToken.trim().length === 0) return undefined;

    return accessToken.trim();
  } catch {
    return undefined;
  }
}

const RefreshGithubParamsSchema = z.object({
  projectId: z.string().openapi({ description: "Project ID" }),
});

const RefreshGithubResponseSchema = z
  .object({
    refreshed: z.boolean().openapi({ description: "Whether the refresh succeeded" }),
    resolved: z.boolean().optional().openapi({
      description: "Whether the project was resolved (if previously unresolved)",
    }),
    needsReauthorization: z.boolean().optional().openapi({
      description: "True if OAuth 'project' scope is needed",
    }),
    itemCounts: z
      .object({
        total: z.number(),
        done: z.number(),
        inProgress: z.number(),
      })
      .optional()
      .openapi({ description: "Updated item counts" }),
    cachedAt: z.number().optional().openapi({ description: "Cache timestamp (epoch ms)" }),
  })
  .openapi("RefreshGithubResponse");

export const projectRefreshGithubRouter = new OpenAPIHono();

projectRefreshGithubRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/projects/{projectId}/refresh-github",
    tags: ["Projects"],
    summary: "Refresh GitHub Project cache",
    description:
      "Refreshes the cached item counts for a linked GitHub Project. Also retries resolution if previously unresolved.",
    request: {
      params: RefreshGithubParamsSchema,
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RefreshGithubResponseSchema,
          },
        },
        description: "GitHub Project cache refreshed",
      },
      400: { description: "No GitHub Project linked" },
      401: { description: "Unauthorized" },
      404: { description: "Project not found" },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { projectId } = c.req.valid("param");

    try {
      const convex = getConvex({ accessToken });

      // Get project
      const project = await convex.query(api.projectQueries.getProject, {
        projectId: projectId as Id<"projects">,
      });

      if (!project) {
        return c.text("Project not found", 404);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: project.teamId });

      // Check if GitHub Project is linked
      if (!project.githubProjectUrl && !project.githubProjectId) {
        return c.text("No GitHub Project linked to this project", 400);
      }

      // Find GitHub connection
      const connections = await convex.query(api.github.listProviderConnections, {
        teamSlugOrId: project.teamId,
      });

      const owner = project.githubProjectOwner;
      const ownerType = project.githubProjectOwnerType ?? "user";
      const normalizedOwner = owner?.toLowerCase();

      const matchingConnection = connections.find(
        (conn) => conn.isActive && conn.accountLogin?.toLowerCase() === normalizedOwner
      );
      const fallbackConnection = connections.find((conn) => conn.isActive);
      const connection = matchingConnection ?? fallbackConnection;

      if (!connection) {
        return c.json({
          refreshed: false,
          needsReauthorization: false,
        });
      }

      // Get OAuth token for user-owned projects
      let userOAuthToken: string | undefined;
      if (ownerType === "user") {
        try {
          userOAuthToken = await getUserOAuthAccessToken(c.req.raw, ["project"]);
        } catch {
          // OAuth token not available
        }

        if (!userOAuthToken) {
          return c.json({
            refreshed: false,
            needsReauthorization: true,
          });
        }
      }

      // If not resolved yet, try to resolve
      let githubProjectId = project.githubProjectId;
      let resolved = false;

      if (!githubProjectId && project.githubProjectNumber && owner) {
        const ghProject = await getProjectByNumber(
          owner,
          project.githubProjectNumber,
          ownerType as "user" | "organization",
          connection.installationId,
          { userOAuthToken }
        );

        if (ghProject) {
          githubProjectId = ghProject.id;
          resolved = true;

          // Update the resolved ID
          await convex.mutation(api.projectQueries.updateProject, {
            projectId: projectId as Id<"projects">,
            githubProjectId: ghProject.id,
          });
        }
      }

      if (!githubProjectId) {
        return c.json({
          refreshed: false,
          resolved: false,
          needsReauthorization: ownerType === "user",
        });
      }

      // Fetch fresh item counts
      const itemCounts = await getProjectItemCounts(githubProjectId, connection.installationId, {
        userOAuthToken,
      });

      const cachedAt = Date.now();

      // Update cached counts
      await convex.mutation(api.projectQueries.updateProject, {
        projectId: projectId as Id<"projects">,
        githubItemsTotal: itemCounts.total,
        githubItemsDone: itemCounts.done,
        githubItemsInProgress: itemCounts.inProgress,
        githubItemsCachedAt: cachedAt,
      });

      return c.json({
        refreshed: true,
        resolved: resolved || undefined,
        itemCounts,
        cachedAt,
      });
    } catch (error) {
      console.error("[projects] Failed to refresh GitHub cache:", error);
      return c.text("Failed to refresh GitHub cache", 500);
    }
  }
);
