import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

import { gitDiff as nativeGitDiff } from "../native/git";
import { getGitHubOAuthToken } from "../utils/getGitHubToken";

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
}

export async function getGitDiff(
  request: GitDiffRequest
): Promise<ReplaceDiffEntry[]> {
  const headRef = request.headRef.trim();
  if (!headRef) {
    return [];
  }

  const baseRef = request.baseRef?.trim();

  // Get GitHub OAuth token for private repo authentication
  const authToken = await getGitHubOAuthToken();

  return await nativeGitDiff({
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
    authToken: authToken ?? undefined,
  });
}
