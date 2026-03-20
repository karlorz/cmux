import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { getConvex } from "@/lib/utils/get-convex";
import { stackServerAppJs } from "@/lib/utils/stack";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import {
  reconcilePullRequestRecords,
  type AggregatePullRequestSummary,
  type PullRequestActionResult,
  type StoredPullRequestInfo,
} from "@cmux/shared/pull-request-state";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { githubPrsDirectActionsRouter } from "./github.prs.direct-actions.route";
import {
  AggregatePullRequestSummarySchema,
  PullRequestActionResultSchema,
  buildMergeCommitInfo,
  buildPrDescription,
  createOctokit,
  createReadyPullRequest,
  emptyAggregate,
  fetchPullRequestCommits,
  fetchPullRequestDetail,
  loadPullRequestDetail,
  markPullRequestReady,
  mergePullRequest,
  reopenPullRequest,
  splitRepoFullName,
  toPullRequestActionResult,
} from "./github.prs.open.helpers";

type TaskDoc = Doc<"tasks">;
type TaskRunDoc = Doc<"taskRuns">;
type ConvexClient = ReturnType<typeof getConvex>;

const OpenPullRequestBody = z
  .object({
    teamSlugOrId: z.string(),
    taskRunId: typedZid("taskRuns"),
  })
  .openapi("GithubOpenPrRequest");

const MergePullRequestBody = z
  .object({
    teamSlugOrId: z.string(),
    taskRunId: typedZid("taskRuns"),
    method: z.enum(["squash", "rebase", "merge"]),
  })
  .openapi("GithubMergePrRequest");

const OpenPullRequestResponse = z
  .object({
    success: z.boolean(),
    results: z.array(PullRequestActionResultSchema),
    aggregate: AggregatePullRequestSummarySchema,
    error: z.string().optional(),
  })
  .openapi("GithubOpenPrResponse");

export const githubPrsOpenRouter = new OpenAPIHono();

githubPrsOpenRouter.route("/", githubPrsDirectActionsRouter);

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

githubPrsOpenRouter.openapi(
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

async function collectRepoFullNamesForRun({
  convex,
  run,
  task,
  teamSlugOrId,
}: {
  convex: ConvexClient;
  run: TaskRunDoc;
  task: TaskDoc;
  teamSlugOrId: string;
}): Promise<string[]> {
  const repos = new Set<string>();

  // 1. Task's configured project
  const project = task.projectFullName?.trim();
  if (project) {
    repos.add(project);
  }

  // 2. Environment's selected repos
  const environmentId = run.environmentId;
  if (environmentId) {
    try {
      const environment = await convex.query(api.environments.get, {
        teamSlugOrId,
        id: environmentId,
      });
      environment?.selectedRepos?.forEach((repoName) => {
        const trimmed = typeof repoName === "string" ? repoName.trim() : "";
        if (trimmed) {
          repos.add(trimmed);
        }
      });
    } catch (error) {
      console.error(
        "[github-open-pr] Failed to load environment repos for run",
        error,
      );
    }
  }

  // 3. Discovered repos from sandbox scanning
  if (run.discoveredRepos?.length) {
    run.discoveredRepos.forEach((repoName) => {
      const trimmed = typeof repoName === "string" ? repoName.trim() : "";
      if (trimmed) {
        repos.add(trimmed);
      }
    });
  }

  return Array.from(repos);
}

async function persistPullRequestResults({
  convex,
  teamSlugOrId,
  run,
  task,
  repoFullNames,
  results,
}: {
  convex: ConvexClient;
  teamSlugOrId: string;
  run: TaskRunDoc;
  task: TaskDoc;
  repoFullNames: readonly string[];
  results: PullRequestActionResult[];
}): Promise<{
  records: StoredPullRequestInfo[];
  aggregate: AggregatePullRequestSummary;
}> {
  const existing = run.pullRequests ?? [];
  const { records, aggregate } = reconcilePullRequestRecords({
    existing,
    updates: results,
    repoFullNames,
  });

  await convex.mutation(api.taskRuns.updatePullRequestState, {
    teamSlugOrId,
    id: run._id,
    state: aggregate.state,
    isDraft: aggregate.isDraft,
    number: aggregate.number,
    url: aggregate.url,
    pullRequests: records,
  });

  await convex.mutation(api.tasks.updateMergeStatus, {
    teamSlugOrId,
    id: task._id,
    mergeStatus: aggregate.mergeStatus,
  });

  return { records, aggregate };
}

