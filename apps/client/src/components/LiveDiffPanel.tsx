import { useEffect, useMemo, useState } from "react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { useLiveDiff, useLiveDiffFile } from "@/hooks/useLiveDiff";
import { gitDiffQueryOptions } from "@/queries/git-diff";
import { normalizeGitRef } from "@/lib/refWithOrigin";
import { NewGitDiffViewer, NewGitDiffViewerWithSidebar } from "./git-diff-view";
import type { ReplaceDiffEntry } from "@cmux/shared/diff-types";
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
  const normalizedBaseBranch = useMemo(
    () => normalizeGitRef(baseBranch),
    [baseBranch],
  );
  const normalizedHeadBranch = useMemo(
    () => normalizeGitRef(headBranch),
    [headBranch],
  );

  const liveDiffQuery = useLiveDiff({
    sandboxId,
    includeContent: true,
    refetchInterval: isRunning ? 10_000 : false,
    enabled: isRunning && Boolean(sandboxId),
  });

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

  const [selectedLiveDiffPath, setSelectedLiveDiffPath] = useState<string>();

  useEffect(() => {
    if (!isRunning || liveDiffQuery.data?.mode !== "file_list_only") {
      setSelectedLiveDiffPath(undefined);
      return;
    }

    const liveDiffFiles = liveDiffQuery.data.files;
    setSelectedLiveDiffPath((previous) => {
      if (previous && liveDiffFiles.some((file) => file.path === previous)) {
        return previous;
      }
      return liveDiffFiles[0]?.path;
    });
  }, [isRunning, liveDiffQuery.data]);

  const liveDiffFileQuery = useLiveDiffFile({
    sandboxId,
    path: selectedLiveDiffPath,
    enabled:
      isRunning &&
      liveDiffQuery.data?.mode === "file_list_only" &&
      Boolean(selectedLiveDiffPath),
  });

  const liveDiffs = useMemo((): ReplaceDiffEntry[] => {
    if (!isRunning) {
      return [];
    }

    if (liveDiffQuery.data?.mode === "full") {
      return liveDiffQuery.data.entries ?? [];
    }

    return liveDiffFileQuery.data ? [liveDiffFileQuery.data] : [];
  }, [isRunning, liveDiffFileQuery.data, liveDiffQuery.data]);

  const committedDiffs = committedDiffQuery.data ?? [];

  if (!selectedRun) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Select a run to view live diffs
      </div>
    );
  }

  if (isRunning && !sandboxId) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Waiting for sandbox to start...
      </div>
    );
  }

  if (!isRunning && !normalizedHeadBranch) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No branch available for diff comparison
      </div>
    );
  }

  if (isRunning && liveDiffQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Failed to load diff
        {liveDiffQuery.error?.message ? `: ${liveDiffQuery.error.message}` : ""}
      </div>
    );
  }

  if (!isRunning && committedDiffQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Failed to load diff
        {committedDiffQuery.error?.message
          ? `: ${committedDiffQuery.error.message}`
          : ""}
      </div>
    );
  }

  if (isRunning && liveDiffQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Loading live diff...
      </div>
    );
  }

  if (!isRunning && committedDiffQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Loading committed diff...
      </div>
    );
  }

  if (!isRunning && committedDiffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No changes found
      </div>
    );
  }

  if (isRunning && liveDiffQuery.data?.summary.totalFiles === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No uncommitted changes
      </div>
    );
  }

  if (isRunning && liveDiffQuery.data?.mode === "file_list_only") {
    return (
      <div className="flex h-full min-h-0 bg-white dark:bg-neutral-900">
        <div className="w-80 shrink-0 border-r border-neutral-200 dark:border-neutral-800">
          <div className="border-b border-neutral-200 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            Large live diff ({Math.ceil(liveDiffQuery.data.totalDiffBytes / 1024)} KB)
          </div>
          <div className="overflow-y-auto">
            {liveDiffQuery.data.files.map((file) => {
              const isSelected = file.path === selectedLiveDiffPath;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setSelectedLiveDiffPath(file.path)}
                  className={`flex w-full flex-col gap-1 border-b border-neutral-200 px-3 py-2 text-left transition-colors dark:border-neutral-800 ${
                    isSelected
                      ? "bg-neutral-100 dark:bg-neutral-800"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-800/70"
                  }`}
                >
                  <span className="truncate text-sm text-neutral-900 dark:text-neutral-100">
                    {file.path}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    +{file.insertions} / -{file.deletions}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-auto">
          {liveDiffFileQuery.isLoading ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Loading file diff...
            </div>
          ) : liveDiffFileQuery.isError ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Failed to load file diff
              {liveDiffFileQuery.error?.message
                ? `: ${liveDiffFileQuery.error.message}`
                : ""}
            </div>
          ) : liveDiffs.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Select a file to inspect its live diff
            </div>
          ) : (
            <NewGitDiffViewer diffs={liveDiffs} isLoading={false} />
          )}
        </div>
      </div>
    );
  }

  if (isRunning && liveDiffs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No uncommitted changes
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <NewGitDiffViewerWithSidebar
        diffs={isRunning ? liveDiffs : committedDiffs}
        isLoading={false}
      />
    </div>
  );
}
