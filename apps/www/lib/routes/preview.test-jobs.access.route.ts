import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

export const previewTestJobsAccessRouter = new OpenAPIHono();

previewTestJobsAccessRouter.openapi(
  createRoute({
    method: "get",
    path: "/preview/test/check-access",
    tags: ["Preview Test"],
    summary: "Check if team has GitHub access to the repository in a PR URL",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
        prUrl: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Access check result",
        content: {
          "application/json": {
            schema: z.object({
              hasAccess: z.boolean(),
              hasConfig: z.boolean(),
              hasActiveInstallation: z.boolean(),
              repoFullName: z.string().nullable(),
              errorCode: z
                .enum([
                  "invalid_url",
                  "no_config",
                  "no_installation",
                  "installation_inactive",
                ])
                .nullable(),
              errorMessage: z.string().nullable(),
              suggestedAction: z.string().nullable(),
            }),
          },
        },
      },
      401: { description: "Unauthorized" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const query = c.req.valid("query");
    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: query.teamSlugOrId });
    const convex = getConvex({ accessToken });

    const result = await convex.query(api.previewTestJobs.checkRepoAccess, {
      teamSlugOrId: query.teamSlugOrId,
      prUrl: query.prUrl,
    });
    return c.json(result);
  },
);
