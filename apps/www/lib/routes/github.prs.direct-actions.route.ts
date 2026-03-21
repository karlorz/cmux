import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  buildMergeCommitInfo,
  createOctokit,
  fetchPullRequestCommits,
  fetchPullRequestDetail,
  mergePullRequest,
} from "./github.prs.open.helpers";

const MergePullRequestSimpleBody = z
  .object({
    teamSlugOrId: z.string(),
    owner: z.string(),
    repo: z.string(),
    number: z.number(),
    method: z.enum(["squash", "rebase", "merge"]),
  })
  .openapi("GithubMergePrSimpleRequest");

const DirectPullRequestActionResponse = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const githubPrsDirectActionsRouter = new OpenAPIHono();

githubPrsDirectActionsRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/integrations/github/prs/merge-simple",
    tags: ["Integrations"],
    summary: "Merge a GitHub pull request using the user's GitHub OAuth token",
    request: {
      body: {
        content: {
          "application/json": {
            schema: MergePullRequestSimpleBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "PR merged successfully",
        content: {
          "application/json": {
            schema: DirectPullRequestActionResponse,
          },
        },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      500: { description: "Failed to merge PR" },
    },
  }),
  async (c) => {
    const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
    if (!user) {
      return c.text("Unauthorized", 401);
    }

    const [{ accessToken }, githubAccount] = await Promise.all([
      user.getAuthJson(),
      user.getConnectedAccount("github"),
    ]);

    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    if (!githubAccount) {
      return c.json(
        {
          success: false,
          message: "GitHub account is not connected",
        },
        401,
      );
    }

    const { accessToken: githubAccessToken } = await githubAccount.getAccessToken();
    if (!githubAccessToken) {
      return c.json(
        {
          success: false,
          message: "GitHub access token unavailable",
        },
        401,
      );
    }

    const body = c.req.valid("json");
    const { teamSlugOrId, owner, repo, number, method } = body;

    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

    const convex = getConvex({ accessToken });
    const repoFullName = `${owner}/${repo}`;

    const existingPR = await convex.query(api.github_prs.getPullRequest, {
      teamSlugOrId,
      repoFullName,
      number,
    });

    if (!existingPR) {
      return c.json(
        {
          success: false,
          message: `PR #${number} not found in database`,
        },
        404,
      );
    }

    const octokit = createOctokit(githubAccessToken);

    try {
      const detail = await fetchPullRequestDetail({
        octokit,
        owner,
        repo,
        number,
      });
      const commits =
        method === "squash"
          ? await fetchPullRequestCommits({
              octokit,
              owner,
              repo,
              number: detail.number,
            })
          : undefined;
      const commitInfo = buildMergeCommitInfo({
        method,
        number: detail.number,
        owner,
        headRef: detail.head_ref,
        prTitle: detail.title,
        prBody: detail.body,
        commitCount: commits?.count,
        firstCommit: commits?.firstCommit,
      });

      await mergePullRequest({
        octokit,
        owner,
        repo,
        number: detail.number,
        method,
        ...commitInfo,
      });

      const mergedPR = await fetchPullRequestDetail({
        octokit,
        owner,
        repo,
        number: detail.number,
      });

      await convex.mutation(api.github_prs.upsertFromServer, {
        teamSlugOrId,
        installationId: existingPR.installationId,
        repoFullName,
        number,
        record: {
          providerPrId: mergedPR.number,
          title: existingPR.title,
          state: mergedPR.state === "open" ? "open" : "closed",
          merged: Boolean(mergedPR.merged_at),
          draft: mergedPR.draft,
          authorLogin: existingPR.authorLogin,
          authorId: existingPR.authorId,
          htmlUrl: mergedPR.html_url,
          baseRef: existingPR.baseRef,
          headRef: existingPR.headRef,
          baseSha: existingPR.baseSha,
          headSha: existingPR.headSha,
          mergeCommitSha: existingPR.mergeCommitSha,
          createdAt: existingPR.createdAt,
          updatedAt: existingPR.updatedAt,
          closedAt: existingPR.closedAt,
          mergedAt: mergedPR.merged_at
            ? new Date(mergedPR.merged_at).getTime()
            : undefined,
          repositoryId: existingPR.repositoryId,
        },
      });

      return c.json({
        success: true,
        message: `PR #${number} merged successfully`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[merge PR] Failed to merge PR", { error, message });
      return c.json(
        {
          success: false,
          message: `Failed to merge PR: ${message}`,
        },
        500,
      );
    }
  },
);
