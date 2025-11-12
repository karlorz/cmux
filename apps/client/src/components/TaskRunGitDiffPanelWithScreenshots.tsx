import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Camera } from "lucide-react";
import { MonacoGitDiffViewer } from "./monaco/monaco-git-diff-viewer";
import { ScreenshotGallery, type ScreenshotSet } from "./screenshots/ScreenshotGallery";
import { gitDiffQueryOptions } from "@/queries/git-diff";
import { normalizeGitRef } from "@/lib/refWithOrigin";
import type { TaskRunWithChildren } from "@/types/task";
import type { Doc, Id } from "@cmux/convex/dataModel";

export interface TaskRunGitDiffPanelWithScreenshotsProps {
  task: Doc<"tasks"> | null | undefined;
  selectedRun: TaskRunWithChildren | null | undefined;
  screenshotSets?: ScreenshotSet[];
  highlightedSetId?: Id<"taskRunScreenshotSets"> | null;
  showScreenshots?: boolean;
  screenshotsPosition?: "top" | "bottom" | "inline";
}

export function TaskRunGitDiffPanelWithScreenshots({
  task,
  selectedRun,
  screenshotSets = [],
  highlightedSetId,
  showScreenshots = true,
  screenshotsPosition = "top",
}: TaskRunGitDiffPanelWithScreenshotsProps) {
  const [screenshotsExpanded, setScreenshotsExpanded] = useState(true);

  const normalizedBaseBranch = useMemo(() => {
    const candidate = task?.baseBranch;
    if (candidate && candidate.trim()) {
      return normalizeGitRef(candidate);
    }
    return normalizeGitRef("main");
  }, [task?.baseBranch]);

  const normalizedHeadBranch = useMemo(
    () => normalizeGitRef(selectedRun?.newBranch),
    [selectedRun?.newBranch],
  );

  const environmentRepos = useMemo<string[]>(() => {
    const repos = selectedRun?.environment?.selectedRepos ?? [];
    const trimmed = repos
      .map((repo: string | undefined) => repo?.trim())
      .filter((repo): repo is string => Boolean(repo));
    return Array.from(new Set(trimmed));
  }, [selectedRun]);

  const repoFullNames = useMemo(() => {
    const names = new Set<string>();
    if (task?.projectFullName?.trim()) {
      names.add(task.projectFullName.trim());
    }
    for (const repo of environmentRepos) {
      names.add(repo);
    }
    return Array.from(names);
  }, [task?.projectFullName, environmentRepos]);

  const diffQueries = useQueries({
    queries: repoFullNames.map((repoFullName) => ({
      ...gitDiffQueryOptions({
        repoFullName,
        baseRef: normalizedBaseBranch || undefined,
        headRef: normalizedHeadBranch ?? "",
      }),
      enabled:
        Boolean(repoFullName?.trim()) && Boolean(normalizedHeadBranch?.trim()),
    })),
  });

  const allDiffs = useMemo(() => {
    return diffQueries.flatMap((query) => query.data ?? []);
  }, [diffQueries]);

  const isLoading = diffQueries.some((query) => query.isLoading);
  const hasError = diffQueries.some((query) => query.isError);

  const hasScreenshots = screenshotSets.length > 0;

  if (!selectedRun || !normalizedHeadBranch) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Select a run to view git diffs
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Loading diffs...
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Failed to load diffs
      </div>
    );
  }

  if (allDiffs.length === 0 && !hasScreenshots) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No changes found
      </div>
    );
  }

  // Inline screenshots within the diff viewer
  if (screenshotsPosition === "inline" && showScreenshots && hasScreenshots) {
    return (
      <div className="relative h-full min-h-0 overflow-auto">
        <div className="border-b border-neutral-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setScreenshotsExpanded(!screenshotsExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between gap-2 bg-neutral-50/60 hover:bg-neutral-100/60 dark:bg-neutral-950/40 dark:hover:bg-neutral-900/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
              <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Screenshots
              </h3>
              <span className="text-xs text-neutral-600 dark:text-neutral-400">
                ({screenshotSets.length} {screenshotSets.length === 1 ? "capture" : "captures"})
              </span>
            </div>
            {screenshotsExpanded ? (
              <ChevronDown className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
            )}
          </button>
        </div>
        {screenshotsExpanded && (
          <ScreenshotGallery
            screenshotSets={screenshotSets}
            highlightedSetId={highlightedSetId}
            compact
            showHeader={false}
            className="border-b border-neutral-200 dark:border-neutral-800"
          />
        )}
        {allDiffs.length > 0 && <MonacoGitDiffViewer diffs={allDiffs} />}
      </div>
    );
  }

  // Screenshots at top or bottom
  const screenshotsComponent = showScreenshots && hasScreenshots && (
    <ScreenshotGallery
      screenshotSets={screenshotSets}
      highlightedSetId={highlightedSetId}
      compact
      className="border-b border-neutral-200 dark:border-neutral-800"
    />
  );

  return (
    <div className="relative h-full min-h-0 overflow-auto">
      {screenshotsPosition === "top" && screenshotsComponent}
      {allDiffs.length > 0 && <MonacoGitDiffViewer diffs={allDiffs} />}
      {screenshotsPosition === "bottom" && screenshotsComponent}
    </div>
  );
}