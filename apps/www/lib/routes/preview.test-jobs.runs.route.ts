import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

const PreviewTestImageSchema = z.object({
  storageId: z.string(),
  mimeType: z.string(),
  fileName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
});

const PreviewTestVideoSchema = z.object({
  storageId: z.string(),
  mimeType: z.string(),
  fileName: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
});

const PreviewTestScreenshotSetSchema = z.object({
  _id: z.string(),
  status: z.enum(["completed", "failed", "skipped"]),
  hasUiChanges: z.boolean().optional().nullable(),
  capturedAt: z.number(),
  error: z.string().optional().nullable(),
  images: z.array(PreviewTestImageSchema),
  videos: z.array(PreviewTestVideoSchema).optional().nullable(),
});

const PreviewTestRunSchema = z.object({
  _id: z.string(),
  prNumber: z.number(),
  prUrl: z.string(),
  prTitle: z.string().optional().nullable(),
  repoFullName: z.string(),
  headSha: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "skipped"]),
  stateReason: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  taskRunId: z.string().optional().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  dispatchedAt: z.number().optional().nullable(),
  startedAt: z.number().optional().nullable(),
  completedAt: z.number().optional().nullable(),
  configRepoFullName: z.string().optional().nullable(),
  screenshotSet: PreviewTestScreenshotSetSchema.optional().nullable(),
});

const PreviewTestRunDetailSchema = PreviewTestRunSchema.extend({
  prDescription: z.string().optional().nullable(),
  baseSha: z.string().optional().nullable(),
  headRef: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  environmentId: z.string().optional().nullable(),
});

export const previewTestJobRunsRouter = new OpenAPIHono();

previewTestJobRunsRouter.openapi(
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

previewTestJobRunsRouter.openapi(
  createRoute({
    method: "get",
    path: "/preview/test/jobs/{previewRunId}",
    tags: ["Preview Test"],
    summary: "Get detailed info about a test preview job",
    request: {
      params: z.object({ previewRunId: z.string() }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Test job details",
        content: {
          "application/json": {
            schema: PreviewTestRunDetailSchema,
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
      const job = await convex.query(api.previewTestJobs.getTestRunDetails, {
        teamSlugOrId: query.teamSlugOrId,
        previewRunId: typedZid("previewRuns").parse(params.previewRunId),
      });
      return c.json(job);
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: error.message }, 404);
      }
      throw error;
    }
  },
);

previewTestJobRunsRouter.openapi(
  createRoute({
    method: "post",
    path: "/preview/test/jobs/{previewRunId}/retry",
    tags: ["Preview Test"],
    summary: "Retry a failed test preview job (creates new run and dispatches)",
    request: {
      params: z.object({ previewRunId: z.string() }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "New job created and dispatched",
        content: {
          "application/json": {
            schema: z.object({
              newPreviewRunId: z.string(),
              dispatched: z.boolean(),
            }),
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
      const result = await convex.action(api.previewTestJobs.retryTestJob, {
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

previewTestJobRunsRouter.openapi(
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
