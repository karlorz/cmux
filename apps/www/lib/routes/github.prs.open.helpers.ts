import type {
  AggregatePullRequestSummary,
  PullRequestActionResult,
  RunPullRequestState,
} from "@cmux/shared/pull-request-state";
import { z } from "@hono/zod-openapi";
import { Octokit } from "octokit";

type GitHubPrBasic = {
  number: number;
  html_url: string;
  state: string;
  draft?: boolean;
};

type GitHubPrDetail = GitHubPrBasic & {
  title: string;
  head_ref: string;
  body: string | null;
  merged_at: string | null;
  node_id: string;
};

type PullRequestCommitInfo = {
  title: string;
  message: string;
};

type PullRequestCommitsSummary = {
  count: number;
  firstCommit?: PullRequestCommitInfo;
};

type MergeCommitInfo = {
  commitTitle?: string;
  commitMessage?: string;
};

type OctokitThrottleOptions = {
  method?: string;
  url?: string;
};

const runPullRequestStates = [
  "none",
  "draft",
  "open",
  "merged",
  "closed",
  "unknown",
] as const;

const taskMergeStatuses = [
  "none",
  "pr_draft",
  "pr_open",
  "pr_merged",
  "pr_closed",
] as const;

export const PullRequestActionResultSchema = z.object({
  repoFullName: z.string(),
  url: z.string().url().optional(),
  number: z.number().optional(),
  state: z.enum(runPullRequestStates),
  isDraft: z.boolean().optional(),
  error: z.string().optional(),
});

export const AggregatePullRequestSummarySchema = z.object({
  state: z.enum(runPullRequestStates),
  isDraft: z.boolean(),
  mergeStatus: z.enum(taskMergeStatuses),
  url: z.string().url().optional(),
  number: z.number().optional(),
});

export function createOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    request: {
      timeout: 30_000,
    },
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: OctokitThrottleOptions,
        _octokit: Octokit,
        retryCount: number,
      ) => {
        const maxRetries = 2;
        const maxWaitSeconds = 15;
        if (retryCount < maxRetries && retryAfter <= maxWaitSeconds) {
          console.warn(
            `GitHub rate limit on ${options.method} ${options.url}. Retrying after ${retryAfter}s (retry #${retryCount + 1}).`,
          );
          return true;
        }
        return false;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        options: OctokitThrottleOptions,
        _octokit: Octokit,
        retryCount: number,
      ) => {
        const maxRetries = 2;
        const maxWaitSeconds = 15;
        if (retryCount < maxRetries && retryAfter <= maxWaitSeconds) {
          console.warn(
            `GitHub secondary rate limit on ${options.method} ${options.url}. Retrying after ${retryAfter}s (retry #${retryCount + 1}).`,
          );
          return true;
        }
        return false;
      },
    },
  });
}

export async function loadPullRequestDetail({
  octokit,
  repoFullName,
  owner,
  repo,
  branchName,
  number,
}: {
  octokit: Octokit;
  repoFullName: string;
  owner: string;
  repo: string;
  branchName: string;
  number?: number;
}): Promise<GitHubPrDetail | null> {
  if (number) {
    try {
      return await fetchPullRequestDetail({
        octokit,
        owner,
        repo,
        number,
      });
    } catch (error) {
      console.warn(
        `[github-open-pr] Failed to fetch PR detail for ${repoFullName}#${number}: ${String(error)}`,
      );
    }
  }

  try {
    const pr = await fetchPullRequestByHead({
      octokit,
      owner,
      repo,
      headOwner: owner,
      branchName,
    });
    if (!pr) {
      return null;
    }
    return await fetchPullRequestDetail({
      octokit,
      owner,
      repo,
      number: pr.number,
    });
  } catch (error) {
    console.warn(
      `[github-open-pr] Failed to locate PR by branch for ${repoFullName}: ${String(error)}`,
    );
    return null;
  }
}

async function fetchPullRequestByHead({
  octokit,
  owner,
  repo,
  headOwner,
  branchName,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  headOwner: string;
  branchName: string;
}): Promise<GitHubPrBasic | null> {
  const head = `${headOwner}:${branchName}`;
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "all",
    head,
    per_page: 10,
  });

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const pr = data[0];
  return {
    number: pr.number,
    html_url: pr.html_url,
    state: pr.state,
    draft: pr.draft ?? undefined,
  };
}

export async function fetchPullRequestDetail({
  octokit,
  owner,
  repo,
  number,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  number: number;
}): Promise<GitHubPrDetail> {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  });
  return {
    number: data.number,
    html_url: data.html_url,
    state: data.state,
    draft: data.draft ?? undefined,
    title: data.title,
    head_ref: data.head.ref,
    body: data.body,
    merged_at: data.merged_at,
    node_id: data.node_id,
  };
}

export async function fetchPullRequestCommits({
  octokit,
  owner,
  repo,
  number,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  number: number;
}): Promise<PullRequestCommitsSummary> {
  const { data } = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: number,
    per_page: 2,
  });

  if (!Array.isArray(data) || data.length === 0) {
    return { count: 0 };
  }

  if (data.length > 1) {
    return { count: data.length };
  }

  const firstCommitMessage = data[0]?.commit?.message ?? "";
  const [firstLine = "", ...remainingLines] = firstCommitMessage.split("\n");
  const firstCommitTitle = firstLine.trim();

  return {
    count: 1,
    firstCommit: {
      title: firstCommitTitle,
      message: remainingLines.join("\n").trim(),
    },
  };
}

export function buildMergeCommitInfo({
  method,
  number,
  owner,
  headRef,
  prTitle,
  prBody,
  commitCount,
  firstCommit,
}: {
  method: "squash" | "rebase" | "merge";
  number: number;
  owner: string;
  headRef: string;
  prTitle: string;
  prBody: string | null;
  commitCount?: number;
  firstCommit?: PullRequestCommitInfo;
}): MergeCommitInfo {
  if (method === "merge") {
    return {
      commitTitle: `Merge pull request #${number} from ${owner}/${headRef}`,
      commitMessage: prBody?.trim() || undefined,
    };
  }

  if (method === "squash") {
    if (commitCount === 1 && firstCommit) {
      return {
        commitTitle: `${firstCommit.title || prTitle} (#${number})`,
        commitMessage: firstCommit.message || undefined,
      };
    }

    return {
      commitTitle: `${prTitle} (#${number})`,
    };
  }

  return {};
}

export async function createReadyPullRequest({
  octokit,
  owner,
  repo,
  title,
  head,
  base,
  body,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
}): Promise<GitHubPrBasic> {
  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    head,
    base,
    body,
    draft: false,
  });
  return {
    number: data.number,
    html_url: data.html_url,
    state: data.state,
    draft: data.draft ?? undefined,
  };
}

export async function markPullRequestReady({
  octokit,
  owner,
  repo,
  number,
  nodeId,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  number: number;
  nodeId: string;
}): Promise<void> {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  });

  if (!data.draft) {
    return;
  }

  const mutation = `
    mutation($pullRequestId: ID!) {
      markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
        pullRequest {
          id
          isDraft
        }
      }
    }
  `;

  await octokit.graphql(mutation, {
    pullRequestId: nodeId || data.node_id,
  });
}

export async function reopenPullRequest({
  octokit,
  owner,
  repo,
  number,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  number: number;
}): Promise<void> {
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: number,
    state: "open",
  });
}

export async function mergePullRequest({
  octokit,
  owner,
  repo,
  number,
  method,
  commitTitle,
  commitMessage,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  number: number;
  method: "squash" | "rebase" | "merge";
  commitTitle?: string;
  commitMessage?: string;
}): Promise<void> {
  await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: number,
    merge_method: method,
    ...(typeof commitTitle === "string" ? { commit_title: commitTitle } : {}),
    ...(typeof commitMessage === "string"
      ? { commit_message: commitMessage }
      : {}),
  });
}

export async function closePullRequest({
  octokit,
  owner,
  repo,
  number,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  number: number;
}): Promise<void> {
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: number,
    state: "closed",
  });
}

export function splitRepoFullName(
  repoFullName: string,
): { owner: string; repo: string } | null {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

export function toPullRequestActionResult(
  repoFullName: string,
  data: GitHubPrDetail,
): PullRequestActionResult {
  const merged = Boolean(data.merged_at);
  return {
    repoFullName,
    url: data.html_url,
    number: data.number,
    state: mapGitHubStateToRunState({
      state: data.state,
      draft: data.draft,
      merged,
    }),
    isDraft: data.draft,
  };
}

function mapGitHubStateToRunState({
  state,
  draft,
  merged,
}: {
  state?: string;
  draft?: boolean;
  merged?: boolean;
}): RunPullRequestState {
  if (merged) {
    return "merged";
  }
  if (draft) {
    return "draft";
  }
  const normalized = (state ?? "").toLowerCase();
  if (normalized === "open") {
    return "open";
  }
  if (normalized === "closed") {
    return "closed";
  }
  if (!normalized) {
    return "none";
  }
  return "unknown";
}

export function emptyAggregate(): AggregatePullRequestSummary {
  return {
    state: "none",
    isDraft: false,
    mergeStatus: "none",
  };
}

export function buildPrDescription({
  taskText,
  title,
  summary,
}: {
  taskText?: string;
  title: string;
  summary?: string;
}): string {
  const parts: string[] = [];

  if (taskText) {
    parts.push(`## Task\n\n${taskText}`);
  } else {
    parts.push(`## Summary\n\n${title}`);
  }

  if (summary && summary.trim().length > 0) {
    parts.push(summary);
  }

  return parts.join("\n\n");
}
