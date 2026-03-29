/**
 * Project GitHub Linking Route
 *
 * POST /api/projects/:id/link-github
 * Links a cmux project to a GitHub Projects v2 board.
 */

import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import {
  getProjectByNumber,
  getProjectItemCounts,
  parseGitHubProjectUrl,
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

    // Note: We can't verify scopes here, but the API call will fail if missing
    return accessToken.trim();
  } catch {
    return undefined;
  }
}

const LinkGithubParamsSchema = z.object({
  projectId: z.string().openapi({ description: "Project ID" }),
});

const LinkGithubRequestSchema = z
  .object({
    githubProjectUrl: z.string().url().openapi({
      description: "GitHub Project URL (e.g., https://github.com/users/owner/projects/1)",
    }),
  })
  .openapi("LinkGithubRequest");

const LinkGithubResponseSchema = z
  .object({
    linked: z.boolean().openapi({ description: "Whether the URL was stored" }),
    resolved: z.boolean().openapi({ description: "Whether the project node ID was resolved" }),
    needsReauthorization: z.boolean().optional().openapi({
      description: "True if OAuth 'project' scope is needed for user-owned projects",
    }),
    githubProjectId: z.string().optional().openapi({ description: "Resolved GitHub Project node ID" }),
    githubProjectTitle: z.string().optional().openapi({ description: "GitHub Project title" }),
    itemCounts: z
      .object({
        total: z.number(),
        done: z.number(),
        inProgress: z.number(),
      })
      .optional()
      .openapi({ description: "Cached item counts (if resolved)" }),
  })
  .openapi("LinkGithubResponse");

export const projectLinkGithubRouter = new OpenAPIHono();

projectLinkGithubRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/projects/{projectId}/link-github",
    tags: ["Projects"],
    summary: "Link GitHub Project",
    description:
      "Link a cmux project to a GitHub Projects v2 board. Parses the URL, stores metadata, and attempts to resolve the project node ID.",
    request: {
      params: LinkGithubParamsSchema,
      body: {
        content: {
          "application/json": {
            schema: LinkGithubRequestSchema,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: LinkGithubResponseSchema,
          },
        },
        description: "GitHub Project linked successfully",
      },
      400: { description: "Invalid GitHub Project URL" },
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
    const { githubProjectUrl } = c.req.valid("json");

    // Parse the GitHub Project URL
    const parsed = parseGitHubProjectUrl(githubProjectUrl);
    if (!parsed) {
      return c.text(
        "Invalid GitHub Project URL. Expected format: https://github.com/users/{owner}/projects/{number} or https://github.com/orgs/{owner}/projects/{number}",
        400
      );
    }

    try {
      const convex = getConvex({ accessToken });

      // Verify project exists and user has access
      const project = await convex.query(api.projectQueries.getProject, {
        projectId: projectId as Id<"projects">,
      });

      if (!project) {
        return c.text("Project not found", 404);
      }

      await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: project.teamId });

      // Always store the URL and parsed metadata (even if resolve fails)
      await convex.mutation(api.projectQueries.updateProject, {
        projectId: projectId as Id<"projects">,
        githubProjectUrl,
        githubProjectOwner: parsed.owner,
        githubProjectNumber: parsed.number,
        githubProjectOwnerType: parsed.ownerType,
      });

      // Find a GitHub connection for this team to use for API calls
      const connections = await convex.query(api.github.listProviderConnections, {
        teamSlugOrId: project.teamId,
      });

      // Find matching connection (prefer owner match)
      const normalizedOwner = parsed.owner.toLowerCase();
      const matchingConnection = connections.find(
        (conn) => conn.isActive && conn.accountLogin?.toLowerCase() === normalizedOwner
      );
      const fallbackConnection = connections.find((conn) => conn.isActive);
      const connection = matchingConnection ?? fallbackConnection;

      if (!connection) {
        // No GitHub connection - linked but not resolved
        return c.json({
          linked: true,
          resolved: false,
          needsReauthorization: false,
        });
      }

      // For user-owned projects, we need OAuth token with 'project' scope
      let userOAuthToken: string | undefined;
      if (parsed.ownerType === "user") {
        try {
          userOAuthToken = await getUserOAuthAccessToken(c.req.raw, ["project"]);
        } catch {
          // OAuth token not available or missing scope
        }

        if (!userOAuthToken) {
          // User project without OAuth - linked but needs reauthorization
          return c.json({
            linked: true,
            resolved: false,
            needsReauthorization: true,
          });
        }
      }

      // Attempt to resolve the project
      const ghProject = await getProjectByNumber(
        parsed.owner,
        parsed.number,
        parsed.ownerType,
        connection.installationId,
        { userOAuthToken }
      );

      if (!ghProject) {
        // Could not resolve - may need reauthorization
        return c.json({
          linked: true,
          resolved: false,
          needsReauthorization: parsed.ownerType === "user",
        });
      }

      // Fetch item counts
      const itemCounts = await getProjectItemCounts(ghProject.id, connection.installationId, {
        userOAuthToken,
      });

      // Update project with resolved ID and cached counts
      await convex.mutation(api.projectQueries.updateProject, {
        projectId: projectId as Id<"projects">,
        githubProjectId: ghProject.id,
        githubItemsTotal: itemCounts.total,
        githubItemsDone: itemCounts.done,
        githubItemsInProgress: itemCounts.inProgress,
        githubItemsCachedAt: Date.now(),
      });

      return c.json({
        linked: true,
        resolved: true,
        githubProjectId: ghProject.id,
        githubProjectTitle: ghProject.title,
        itemCounts,
      });
    } catch (error) {
      console.error("[projects] Failed to link GitHub project:", error);
      return c.text("Failed to link GitHub project", 500);
    }
  }
);
