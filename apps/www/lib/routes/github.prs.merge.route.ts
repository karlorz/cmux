import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  MergePullRequestBody,
  OpenPullRequestResponse,
  buildMergeCommitInfo,
  collectRepoFullNamesForRun,
  createOctokit,
  emptyAggregate,
  fetchPullRequestCommits,
  fetchPullRequestDetail,
  loadPullRequestDetail,
  markPullRequestReady,
  mergePullRequest,
  persistPullRequestResults,
  reopenPullRequest,
  splitRepoFullName,
  toPullRequestActionResult,
} from "./github.prs.open.helpers";

export const githubPrsMergeRouter = new OpenAPIHono();

githubPrsMergeRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/integrations/github/prs/merge",
    tags: ["Integrations"],
    summary: "Merge GitHub pull requests for a task run using the user's GitHub OAuth token",
    request: {
      body: {
        content: {
          "application/json": {
            schema: MergePullRequestBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "PRs merged",
        content: {
          "application/json": {
            schema: OpenPullRequestResponse,
          },
        },
      },
      400: { description: "Invalid request" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run not found" },
      500: { description: "Failed to merge PRs" },
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
          results: [],
          aggregate: emptyAggregate(),
          error: "GitHub account is not connected",
        },
        401,
      );
    }

    const { accessToken: githubAccessToken } = await githubAccount.getAccessToken();
    if (!githubAccessToken) {
      return c.json(
        {
          success: false,
          results: [],
          aggregate: emptyAggregate(),
          error: "GitHub access token unavailable",
        },
        401,
      );
    }

    const body = c.req.valid("json");
    const { teamSlugOrId, taskRunId, method } = body;

    await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

    const convex = getConvex({ accessToken });

    const run = await convex.query(api.taskRuns.get, {
      teamSlugOrId,
      id: taskRunId,
    });

    if (!run) {
      return c.json(
        {
          success: false,
          results: [],
          aggregate: emptyAggregate(),
          error: "Task run not found",
        },
        404,
      );
    }

    const task = await convex.query(api.tasks.getById, {
      teamSlugOrId,
      id: run.taskId,
    });

    if (!task) {
      return c.json(
        {
          success: false,
          results: [],
          aggregate: emptyAggregate(),
          error: "Task not found",
        },
        404,
      );
    }

    // Check /simplify pre-merge gate
    const orchestrationSettings = await convex.query(api.orchestrationSettings.get, {
      teamSlugOrId,
    });

    if (orchestrationSettings.requireSimplifyBeforeMerge) {
      const simplifyPassed = !!run.simplifyPassedAt || !!run.simplifySkippedReason;
      if (!simplifyPassed) {
        return c.json(
          {
            success: false,
            results: [],
            aggregate: emptyAggregate(),
            error: "Merge blocked: /simplify is required before merge. Please run /simplify (or /simplify --quick) first.",
          },
          403,
        );
      }
    }

    const branchName = run.newBranch?.trim();
    if (!branchName) {
      return c.json(
        {
          success: false,
          results: [],
          aggregate: emptyAggregate(),
          error: "Missing branch name for run",
        },
        400,
      );
    }

    const repoFullNames = await collectRepoFullNamesForRun({
      convex,
      run,
      task,
      teamSlugOrId,
    });

    if (repoFullNames.length === 0) {
      return c.json(
        {
          success: false,
          results: [],
          aggregate: emptyAggregate(),
          error: "No repositories configured for this run",
        },
        400,
      );
    }

    const existingByRepo = new Map(
      (run.pullRequests ?? []).map(
        (record) => [record.repoFullName, record] as const,
      ),
    );

    const octokit = createOctokit(githubAccessToken);

    const results = await Promise.all(
      repoFullNames.map(async (repoFullName) => {
        try {
          const split = splitRepoFullName(repoFullName);
          if (!split) {
            throw new Error(`Invalid repository name: ${repoFullName}`);
          }

          const { owner, repo } = split;
          const existingRecord = existingByRepo.get(repoFullName);

          let detail = await loadPullRequestDetail({
            octokit,
            repoFullName,
            owner,
            repo,
            branchName,
            number: existingRecord?.number,
          });

          if (!detail) {
            throw new Error("Pull request not found for this branch");
          }

          if (detail.draft) {
            await markPullRequestReady({
              octokit,
              owner,
              repo,
              number: detail.number,
              nodeId: detail.node_id,
            });
            detail = await fetchPullRequestDetail({
              octokit,
              owner,
              repo,
              number: detail.number,
            });
          }

          if (
            (detail.state ?? "").toLowerCase() === "closed" &&
            !detail.merged_at
          ) {
            await reopenPullRequest({
              octokit,
              owner,
              repo,
              number: detail.number,
            });
            detail = await fetchPullRequestDetail({
              octokit,
              owner,
              repo,
              number: detail.number,
            });
          }

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

          const mergedDetail = await fetchPullRequestDetail({
            octokit,
            owner,
            repo,
            number: detail.number,
          });

          return toPullRequestActionResult(repoFullName, {
            ...mergedDetail,
            merged_at:
              mergedDetail.merged_at ?? new Date().toISOString(),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            repoFullName,
            url: undefined,
            number: undefined,
            state: "unknown" as const,
            isDraft: undefined,
            error: message,
          };
        }
      }),
    );

    try {
      const persisted = await persistPullRequestResults({
        convex,
        teamSlugOrId,
        run,
        task,
        repoFullNames,
        results,
      });

      const errors = results
        .filter((result) => result.error)
        .map((result) => `${result.repoFullName}: ${result.error}`);

      return c.json({
        success: errors.length === 0,
        results,
        aggregate: persisted.aggregate,
        error: errors.length > 0 ? errors.join("; ") : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          success: false,
          results,
          aggregate: emptyAggregate(),
          error: message,
        },
        500,
      );
    }
  },
);
