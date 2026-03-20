import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { fetchPullRequest } from "@/lib/github/fetch-pull-request";
import { getConvex } from "@/lib/utils/get-convex";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { api } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

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

export const previewTestJobsCreateRouter = new OpenAPIHono();

previewTestJobsCreateRouter.openapi(
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
