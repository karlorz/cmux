import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { PreviewTestRunSchema } from "./preview.test-jobs.schemas";

export const previewTestJobsListRouter = new OpenAPIHono();

previewTestJobsListRouter.openapi(
  createRoute({
    method: "get",
    path: "/preview/test/jobs",
    tags: ["Preview Test"],
    summary: "List test preview jobs for a team",
    request: {
      query: z.object({
        teamSlugOrId: z.string(),
        limit: z.coerce.number().min(1).max(100).optional(),
      }),
    },
    responses: {
      200: {
        description: "Test jobs listed",
        content: {
          "application/json": {
            schema: z.object({
              jobs: z.array(PreviewTestRunSchema),
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

    const jobs = await convex.query(api.previewTestJobs.listTestRuns, {
      teamSlugOrId: query.teamSlugOrId,
      limit: query.limit,
    });
    return c.json({ jobs });
  },
);
