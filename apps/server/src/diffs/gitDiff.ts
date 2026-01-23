import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";

import { gitDiff as nativeGitDiff } from "../native/git";

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
  /**
   * GitHub OAuth token for authenticating private repo access.
   * Used transiently for clone/fetch - never persisted to disk or logged.
   */
  authToken?: string;
}

export async function getGitDiff(
  request: GitDiffRequest
): Promise<ReplaceDiffEntry[]> {
  const headRef = request.headRef.trim();
  if (!headRef) {
    return [];
  }

  const baseRef = request.baseRef?.trim();

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
    authToken: request.authToken,
  });
}
