import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

import { gitDiff as nativeGitDiff } from "../native/git";
import { getGitHubOAuthToken } from "../utils/getGitHubToken";
import { env } from "../utils/server-env";

export interface GitDiffRequest {
  headRef: string;
  baseRef?: string;
  repoFullName?: string;
  repoUrl?: string;
  authToken?: string;
  teamSlugOrId?: string;
  originPathOverride?: string;
  includeContents?: boolean;
  maxBytes?: number;
  lastKnownBaseSha?: string;
  lastKnownMergeCommitSha?: string;
}

function isGitHubDotComHttpsUrl(url?: string): boolean {
  return typeof url === "string" && url.startsWith("https://github.com/");
}

export async function getGitDiff(
  request: GitDiffRequest
): Promise<ReplaceDiffEntry[]> {
  const headRef = request.headRef.trim();
  if (!headRef) {
    return [];
  }

  const baseRef = request.baseRef?.trim();

  const repoUrl =
    request.repoUrl ??
    (request.repoFullName ? `https://github.com/${request.repoFullName}.git` : undefined);

  // In web mode, native git runs in a headless cache with no credential helper.
  // For private GitHub repos, we must provide auth explicitly (but never persist it).
  const authToken =
    request.authToken ??
    (env.NEXT_PUBLIC_WEB_MODE &&
    !request.originPathOverride &&
    isGitHubDotComHttpsUrl(repoUrl)
      ? await getGitHubOAuthToken()
      : undefined);

  return await nativeGitDiff({
    headRef,
    baseRef: baseRef ? baseRef : undefined,
    repoFullName: request.repoFullName,
    repoUrl: request.repoUrl,
    authToken: authToken ?? undefined,
    teamSlugOrId: request.teamSlugOrId,
    originPathOverride: request.originPathOverride,
    includeContents: request.includeContents,
    maxBytes: request.maxBytes,
    lastKnownBaseSha: request.lastKnownBaseSha,
    lastKnownMergeCommitSha: request.lastKnownMergeCommitSha,
  });
}
