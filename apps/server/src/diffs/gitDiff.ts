import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

import { gitDiff as nativeGitDiff } from "../native/git";
import { getGitHubOAuthToken } from "../utils/getGitHubToken";
import { env } from "../utils/server-env";

export interface GitDiffRequest {
  headRef: string;
  baseRef?: string;
  repoFullName?: string;
  repoUrl?: string;
  teamSlugOrId?: string;
  originPathOverride?: string;
  includeContents?: boolean;
  maxBytes?: number;
  lastKnownBaseSha?: string;
  lastKnownMergeCommitSha?: string;
  authToken?: string;
}

function isGitHubRepoTarget(request: GitDiffRequest): boolean {
  if (request.repoFullName) return true; // repoFullName implies GitHub in this code path
  const u = request.repoUrl?.trim();
  return !!u && (u.startsWith("https://github.com/") || u.startsWith("http://github.com/"));
}

function isLikelyGitAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.toLowerCase();
  return (
    m.includes("could not read username") ||
    m.includes("terminal prompts disabled") ||
    m.includes("authentication failed") ||
    m.includes("repository not found") ||
    m.includes("access denied") ||
    m.includes("fatal: authentication") ||
    m.includes("http basic")
  );
}

export async function getGitDiff(
  request: GitDiffRequest
): Promise<ReplaceDiffEntry[]> {
  const headRef = request.headRef.trim();
  if (!headRef) {
    return [];
  }

  const baseRef = request.baseRef?.trim();

  const baseOpts = {
    headRef,
    baseRef: baseRef ? baseRef : undefined,
    repoFullName: request.repoFullName,
    repoUrl: request.repoUrl,
    teamSlugOrId: request.teamSlugOrId,
    originPathOverride: request.originPathOverride,
    includeContents: request.includeContents,
    maxBytes: request.maxBytes,
    lastKnownBaseSha: request.lastKnownBaseSha,
    lastKnownMergeCommitSha: request.lastKnownMergeCommitSha,
    authToken: request.authToken,
  };

  // If caller already provided a token, use it directly (no retries).
  if (baseOpts.authToken) {
    return await nativeGitDiff(baseOpts);
  }

  try {
    return await nativeGitDiff(baseOpts);
  } catch (error) {
    // Only attempt Stack Auth token retrieval in web mode for GitHub HTTPS repos.
    // Public repo behavior remains unchanged: we only retry on auth-like failures.
    if (
      env.NEXT_PUBLIC_WEB_MODE &&
      !request.originPathOverride &&
      isGitHubRepoTarget(request) &&
      isLikelyGitAuthError(error)
    ) {
      const token = await getGitHubOAuthToken();
      if (token) {
        return await nativeGitDiff({ ...baseOpts, authToken: token });
      }
    }
    throw error;
  }
}
