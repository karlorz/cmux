import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { api, internal } from "@cmux/convex/api";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { getConvex } from "../utils/get-convex";

export const githubPrsBackfillCommentsRouter = new OpenAPIHono();

const Body = z
  .object({
    team: z.string().min(1).openapi({ description: "Team slug or UUID" }),
    url: z
      .string()
      .url()
      .openapi({ description: "GitHub PR URL like https://github.com/{owner}/{repo}/pull/{number}" }),
  })
  .openapi("GithubPrsBackfillCommentsBody");

githubPrsBackfillCommentsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/integrations/github/prs/backfill-comments",
    tags: ["Integrations"],
    summary: "Backfill all comments (issue and review) for a PR",
    request: {
      body: {
        content: {
          "application/json": { schema: Body },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "OK",
      },
      400: { description: "Bad request" },
      401: { description: "Unauthorized" },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);
    const { team, url } = c.req.valid("json");

    const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
    if (!m) return c.text("Bad PR URL", 400);
    const owner = m[1];
    const repo = m[2];
    const number = Number(m[3]);

    const convex = getConvex({ accessToken });

    // Find the PR in Convex
    const pr = await convex.query(api.github_prs.getPullRequest, {
      teamSlugOrId: team,
      repoFullName: `${owner}/${repo}`,
      number,
    });

    if (!pr) {
      return c.text("PR not found in database. Please backfill the PR first.", 404);
    }

    // Trigger comment backfill
    const result = await convex.action(internal.github_pr_comments.backfillComments, {
      pullRequestId: pr._id,
    });

    return c.json(result);
  }
);
