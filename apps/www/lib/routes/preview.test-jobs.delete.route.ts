import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

export const previewTestJobsDeleteRouter = new OpenAPIHono();

previewTestJobsDeleteRouter.openapi(
  createRoute({
    method: "delete",
    path: "/preview/test/jobs/{previewRunId}",
    tags: ["Preview Test"],
    summary: "Delete a test preview job",
    request: {
      params: z.object({ previewRunId: z.string() }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Test job deleted",
        content: {
          "application/json": {
            schema: z.object({ deleted: z.boolean() }),
          },
        },
      },
      401: { description: "Unauthorized" },
      404: { description: "Preview run not found" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const params = c.req.valid("param");
    const query = c.req.valid("query");
    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: query.teamSlugOrId });
    const convex = getConvex({ accessToken });

    try {
      const result = await convex.mutation(api.previewTestJobs.deleteTestRun, {
        teamSlugOrId: query.teamSlugOrId,
        previewRunId: typedZid("previewRuns").parse(params.previewRunId),
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: error.message }, 404);
      }
      throw error;
    }
  },
);
