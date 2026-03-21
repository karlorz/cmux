import { useMemo } from "react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { useLiveDiff } from "@/hooks/useLiveDiff";
import { gitDiffQueryOptions } from "@/queries/git-diff";
import { normalizeGitRef } from "@/lib/refWithOrigin";
import { NewGitDiffViewerWithSidebar } from "./git-diff-view";
import type { ReplaceDiffEntry, DiffStatus } from "@cmux/shared/diff-types";
import type { Id } from "@cmux/convex/dataModel";
import type { TaskRunWithChildren } from "@/types/task";

export interface LiveDiffPanelProps {
  sandboxId: string | undefined;
  isRunning: boolean;
  taskRunId: Id<"taskRuns"> | undefined;
  teamSlugOrId: string;
  selectedRun: TaskRunWithChildren | null | undefined;
  repoFullName: string | undefined;
  baseBranch: string | undefined;
  headBranch: string | undefined;
}

/**
 * Panel that shows live git diff while sandbox is running,
 * or falls back to committed diff when stopped.
 */
export function LiveDiffPanel({
  sandboxId,
  isRunning,
  selectedRun,
  repoFullName,
  baseBranch,
  headBranch,
}: LiveDiffPanelProps) {
  // Normalize branches for committed diff query
  const normalizedBaseBranch = useMemo(
    () => normalizeGitRef(baseBranch),
    [baseBranch]
  );
  const normalizedHeadBranch = useMemo(
    () => normalizeGitRef(headBranch),
    [headBranch]
  );

  // Live diff from running sandbox
  const liveDiffQuery = useLiveDiff({
    sandboxId,
    includeContent: true,
    refetchInterval: isRunning ? 10_000 : false,
    enabled: isRunning && Boolean(sandboxId),
  });

  // Committed diff fallback (when not running)
  const committedDiffQuery = useTanstackQuery({
    ...gitDiffQueryOptions({
      repoFullName,
      headRef: normalizedHeadBranch ?? "",
      baseRef: normalizedBaseBranch ?? undefined,
      includeContents: true,
    }),
    enabled:
      !isRunning &&
      Boolean(repoFullName?.trim()) &&
      Boolean(normalizedHeadBranch?.trim()),
  });

  // Convert live diff result to ReplaceDiffEntry format
  const liveDiffs = useMemo((): ReplaceDiffEntry[] => {
    if (!liveDiffQuery.data?.files) return [];

    return liveDiffQuery.data.files.map((file) => {
      // Map live diff status to DiffStatus
      let status: DiffStatus;
      switch (file.status) {
        case "added":
        case "untracked":
          status = "added";
          break;
        case "deleted":
          status = "deleted";
          break;
        case "renamed":
          status = "renamed";
          break;
        case "modified":
        default:
          status = "modified";
          break;
      }

      return {
        filePath: file.path,
        status,
        additions: file.insertions,
        deletions: file.deletions,
        isBinary: false,
        // Content from live diff is raw unified diff stored in patch field
        patch: liveDiffQuery.data?.diff,
      };
    });
  }, [liveDiffQuery.data]);

  // Determine which diffs to show
  const diffs = isRunning ? liveDiffs : (committedDiffQuery.data ?? []);
  const isLoading = isRunning
    ? liveDiffQuery.isLoading
    : committedDiffQuery.isLoading;
  const hasError = isRunning
    ? liveDiffQuery.isError
    : committedDiffQuery.isError;
  const errorMessage = isRunning
    ? liveDiffQuery.error?.message
    : committedDiffQuery.error?.message;

  // No sandbox selected
  if (!selectedRun) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Select a run to view live diffs
      </div>
    );
  }

  // Running but no sandbox ID yet
  if (isRunning && !sandboxId) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Waiting for sandbox to start...
      </div>
    );
  }

  // Not running and no head branch
  if (!isRunning && !normalizedHeadBranch) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No branch available for diff comparison
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Failed to load diff{errorMessage ? `: ${errorMessage}` : ""}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Loading {isRunning ? "live" : "committed"} diff...
      </div>
    );
  }

  if (diffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {isRunning ? "No uncommitted changes" : "No changes found"}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <NewGitDiffViewerWithSidebar diffs={diffs} isLoading={isLoading} />
    </div>
  );
}
