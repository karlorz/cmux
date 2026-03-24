import { waitForConnectedSocket } from "@/contexts/socket/socket-boot";
import { normalizeGitRef } from "@/lib/refWithOrigin";
import type { ReplaceDiffEntry } from "@cmux/shared";
import { queryOptions } from "@tanstack/react-query";

export interface GitDiffQuery {
  repoFullName?: string;
  repoUrl?: string;
  originPathOverride?: string;
  headRef: string;
  baseRef?: string;
  includeContents?: boolean;
  maxBytes?: number;
  lastKnownBaseSha?: string;
  lastKnownMergeCommitSha?: string;
  forceRefresh?: boolean;
}

export function gitDiffQueryOptions({
  repoFullName,
  repoUrl,
  originPathOverride,
  headRef,
  baseRef,
  includeContents = true,
  maxBytes,
  lastKnownBaseSha,
  lastKnownMergeCommitSha,
  forceRefresh,
}: GitDiffQuery) {
  const repoKey = repoFullName ?? repoUrl ?? originPathOverride ?? "";

  const canonicalHeadRef = normalizeGitRef(headRef) || headRef?.trim() || "";
  const canonicalBaseRef =
    normalizeGitRef(baseRef) || baseRef?.trim() || "";

  return queryOptions({
    queryKey: [
      "git-diff",
      repoKey,
      canonicalHeadRef,
      canonicalBaseRef,
      includeContents ? "with-contents" : "no-contents",
      maxBytes ?? "",
      lastKnownBaseSha ?? "",
      lastKnownMergeCommitSha ?? "",
      forceRefresh ? "force" : "",
    ],
    queryFn: async () => {
      const socket = await waitForConnectedSocket();
      const TIMEOUT_MS = 60_000; // 60 second timeout for large repos
      return await new Promise<ReplaceDiffEntry[]>((resolve, reject) => {
        let didRespond = false;
        const timeout = setTimeout(() => {
          if (!didRespond) {
            didRespond = true;
            reject(new Error("Git diff request timed out. The repository may be large or the server is busy."));
          }
        }, TIMEOUT_MS);

        socket.emit(
          "git-diff",
          {
            repoFullName,
            repoUrl,
            originPathOverride,
            headRef: canonicalHeadRef,
            baseRef: canonicalBaseRef || undefined,
            includeContents,
            maxBytes,
            lastKnownBaseSha,
            lastKnownMergeCommitSha,
            forceRefresh,
          },
          (
            resp:
              | { ok: true; diffs: ReplaceDiffEntry[]; branchDeleted?: boolean }
              | { ok: false; error: string; diffs?: []; branchDeleted?: boolean }
          ) => {
            if (didRespond) return;
            didRespond = true;
            clearTimeout(timeout);

            if (resp.ok) {
              resolve(resp.diffs);
            } else {
              // Provide more specific error messages
              let errorMessage = resp.error || "Failed to load repository diffs";
              if (resp.branchDeleted) {
                errorMessage = `Branch '${canonicalHeadRef}' was not found. It may have been deleted after the PR was merged.`;
              }
              reject(new Error(errorMessage));
            }
          }
        );
      });
    },
    staleTime: 10_000,
    refetchOnMount: "always",
    enabled: Boolean(canonicalHeadRef) && Boolean(repoKey.trim()),
  });
}
