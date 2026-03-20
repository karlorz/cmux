import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { api } from "@cmux/convex/api";
import type { PullRequestActionResult } from "@cmux/shared/pull-request-state";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { githubPrsCloseRouter } from "./github.prs.close.route";
import { githubPrsDirectActionsRouter } from "./github.prs.direct-actions.route";
import { githubPrsMergeRouter } from "./github.prs.merge.route";
import {
  OpenPullRequestBody,
  OpenPullRequestResponse,
  buildPrDescription,
  collectRepoFullNamesForRun,
  createOctokit,
  createReadyPullRequest,
  emptyAggregate,
  fetchPullRequestDetail,
  loadPullRequestDetail,
  markPullRequestReady,
  persistPullRequestResults,
  splitRepoFullName,
  toPullRequestActionResult,
} from "./github.prs.open.helpers";

export const githubPrsOpenRouter = new OpenAPIHono();

githubPrsOpenRouter.route("/", githubPrsCloseRouter);
githubPrsOpenRouter.route("/", githubPrsDirectActionsRouter);
githubPrsOpenRouter.route("/", githubPrsMergeRouter);

githubPrsOpenRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/integrations/github/prs/open",
    tags: ["Integrations"],
    summary:
      "Create or update GitHub pull requests for a task run using the user's GitHub OAuth token",
    request: {
      body: {
        content: {
          "application/json": {
            schema: OpenPullRequestBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        description: "PRs created or updated",
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
      500: { description: "Failed to create or update PRs" },
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
    const { teamSlugOrId, taskRunId } = body;

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

    const baseBranch = task.baseBranch?.trim() || "main";
    const title = task.pullRequestTitle || task.text || "cmux changes";
    const truncatedTitle =
      title.length > 72 ? `${title.slice(0, 69)}...` : title;
    const description = buildPrDescription({
      taskText: task.text,
      title,
      summary: run.summary,
    });

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
          const existingNumber = existingRecord?.number;

          let detail = await loadPullRequestDetail({
            octokit,
            repoFullName,
            owner,
            repo,
            branchName,
            number: existingNumber,
          });

          if (!detail) {
            const created = await createReadyPullRequest({
              octokit,
              owner,
              repo,
              title: truncatedTitle,
              head: branchName,
              base: baseBranch,
              body: description,
            });
            detail = await fetchPullRequestDetail({
              octokit,
              owner,
              repo,
              number: created.number,
            });
          } else if (detail.draft) {
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

          return toPullRequestActionResult(repoFullName, detail);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            repoFullName,
            url: undefined,
            number: undefined,
            state: "none" as const,
            isDraft: undefined,
            error: message,
          } satisfies PullRequestActionResult;
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


