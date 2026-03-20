import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { fetchPullRequest } from "@/lib/github/fetch-pull-request";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { previewTestJobRunsRouter } from "./preview.test-jobs.runs.route";

function parsePrUrl(prUrl: string): {
  owner: string;
  repo: string;
  prNumber: number;
  repoFullName: string;
} | null {
  const match = prUrl.match(
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i,
  );
  if (!match) {
    return null;
  }
  const [, owner, repo, prNumberStr] = match;
  if (!owner || !repo || !prNumberStr) {
    return null;
  }
  return {
    owner,
    repo,
    prNumber: parseInt(prNumberStr, 10),
    repoFullName: `${owner}/${repo}`.toLowerCase(),
  };
}

export const previewTestJobsRouter = new OpenAPIHono();

previewTestJobsRouter.route("/", previewTestJobRunsRouter);

previewTestJobsRouter.openapi(
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

previewTestJobsRouter.openapi(
  createRoute({
    method: "post",
    path: "/preview/test/jobs",
    tags: ["Preview Test"],
    summary: "Create a test preview job from a PR URL (fetches real PR data from GitHub)",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              teamSlugOrId: z.string(),
              prUrl: z.string().url(),
            }),
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "Test job created (task/taskRun will be created after VM starts)",
        content: {
          "application/json": {
            schema: z.object({
              previewRunId: z.string(),
              prNumber: z.number(),
              repoFullName: z.string(),
            }),
          },
        },
      },
      400: { description: "Invalid PR URL" },
      401: { description: "Unauthorized" },
      404: { description: "Preview config not found or PR not found on GitHub" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = c.req.valid("json");
    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId: body.teamSlugOrId });
    const convex = getConvex({ accessToken });

    const parsed = parsePrUrl(body.prUrl);
    if (!parsed) {
      return c.json(
        {
          error:
            "Invalid PR URL format. Expected: https://github.com/owner/repo/pull/123",
        },
        400,
      );
    }

    let prData: {
      headSha: string;
      baseSha: string | undefined;
      prTitle: string;
      prDescription: string | undefined;
      headRef: string | undefined;
      headRepoFullName: string | undefined;
      headRepoCloneUrl: string | undefined;
    };

    try {
      const ghPr = await fetchPullRequest(parsed.owner, parsed.repo, parsed.prNumber);
      prData = {
        headSha: ghPr.head.sha,
        baseSha: ghPr.base?.sha,
        prTitle: ghPr.title,
        prDescription: ghPr.body ?? undefined,
        headRef: ghPr.head.ref,
        headRepoFullName: ghPr.head.repo?.full_name,
        headRepoCloneUrl: ghPr.head.repo?.clone_url,
      };
    } catch (error) {
      console.error("[preview-test] Failed to fetch PR from GitHub:", error);
      return c.json(
        {
          error: `Failed to fetch PR #${parsed.prNumber} from GitHub. Make sure the PR exists and is accessible.`,
        },
        404,
      );
    }

    try {
      const result = await convex.mutation(api.previewTestJobs.createTestRun, {
        teamSlugOrId: body.teamSlugOrId,
        prUrl: body.prUrl,
        prMetadata: {
          headSha: prData.headSha,
          baseSha: prData.baseSha,
          prTitle: prData.prTitle,
          prDescription: prData.prDescription,
          headRef: prData.headRef,
          headRepoFullName: prData.headRepoFullName,
          headRepoCloneUrl: prData.headRepoCloneUrl,
        },
      });
      return c.json(result);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("Invalid PR URL")) {
          return c.json({ error: error.message }, 400);
        }
        if (error.message.includes("No preview configuration")) {
          return c.json({ error: error.message }, 404);
        }
      }
      throw error;
    }
  },
);

previewTestJobsRouter.openapi(
  createRoute({
    method: "post",
    path: "/preview/test/jobs/{previewRunId}/dispatch",
    tags: ["Preview Test"],
    summary: "Start a test preview job (trigger screenshot capture)",
    request: {
      params: z.object({ previewRunId: z.string() }),
      query: z.object({
        teamSlugOrId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Job dispatched",
        content: {
          "application/json": {
            schema: z.object({ dispatched: z.boolean() }),
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
      const result = await convex.action(api.previewTestJobs.dispatchTestJob, {
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

