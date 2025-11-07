import { useMemo, useState } from "react";
import { useQuery as useRQ } from "@tanstack/react-query";
import { normalizeGitRef } from "@/lib/refWithOrigin";
import type { TaskRunWithChildren } from "@/types/task";
import type { Doc, Id } from "@cmux/convex/dataModel";
import { RunDiffSection } from "./RunDiffSection";
import { RunScreenshotGallery } from "./RunScreenshotGallery";
import { WorkflowRunsWrapper } from "./WorkflowRunsWrapper";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cmux/convex/api";

export interface TaskRunGitDiffPanelProps {
  task: Doc<"tasks"> | null | undefined;
  selectedRun: TaskRunWithChildren | null | undefined;
  taskId: Id<"tasks">;
  teamSlugOrId: string;
}

type PullRequestSummary = {
  repoFullName: string;
  number: number;
  headSha?: string | null;
  url?: string | null;
};

export function TaskRunGitDiffPanel({
  task,
  selectedRun,
  taskId,
  teamSlugOrId,
}: TaskRunGitDiffPanelProps) {
  const [checksExpandedByRepo, setChecksExpandedByRepo] = useState<
    Record<string, boolean | null>
  >({});

  const runId = selectedRun?._id;

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
    if (task?.projectFullName?.trim()) {
      return [task.projectFullName.trim()];
    }
    return environmentRepos;
  }, [task?.projectFullName, environmentRepos]);

  const [primaryRepo, ...additionalRepos] = repoFullNames;

  const runDiffContextQueryOptions = useMemo(() => {
    if (!runId) {
      return null;
    }
    return convexQuery(api.taskRuns.getRunDiffContext, {
      teamSlugOrId,
      taskId,
      runId,
    });
  }, [runId, taskId, teamSlugOrId]);

  const runDiffContextQuery = useRQ({
    ...(runDiffContextQueryOptions ?? {
      queryKey: ["taskRunGitDiffPanel", "runDiffContext", taskId],
      queryFn: async () => null,
    }),
    enabled: Boolean(runDiffContextQueryOptions),
  });

  const screenshotSets = runDiffContextQuery.data?.screenshotSets ?? [];
  const screenshotSetsLoading =
    runDiffContextQuery.isLoading && screenshotSets.length === 0;

  const pullRequests = useMemo(() => {
    if (!selectedRun?.pullRequests?.length) {
      return undefined;
    }
    return selectedRun.pullRequests.filter(
      (pr): pr is PullRequestSummary =>
        Boolean(pr?.repoFullName?.trim()) &&
        pr?.number !== undefined &&
        pr?.number !== null,
    );
  }, [selectedRun?.pullRequests]);

  const branchMetadataQueryOptions = useMemo(() => {
    if (!primaryRepo) {
      return null;
    }
    return convexQuery(api.github.getBranchesByRepo, {
      teamSlugOrId,
      repo: primaryRepo,
    });
  }, [teamSlugOrId, primaryRepo]);

  const branchMetadataQuery = useRQ({
    ...(branchMetadataQueryOptions ?? {
      queryKey: ["taskRunGitDiffPanel", "branchMetadata", teamSlugOrId],
      queryFn: async () => [] as Doc<"branches">[],
    }),
    enabled: Boolean(branchMetadataQueryOptions),
  });

  const branchMetadata = branchMetadataQuery.data as Doc<"branches">[] | undefined;

  const baseBranchMetadata = useMemo(() => {
    if (!task?.baseBranch) {
      return undefined;
    }
    return branchMetadata?.find((branch) => branch.name === task.baseBranch);
  }, [branchMetadata, task?.baseBranch]);

  const metadataByRepo = useMemo(() => {
    if (!primaryRepo || !baseBranchMetadata) {
      return undefined;
    }
    const { lastKnownBaseSha, lastKnownMergeCommitSha } = baseBranchMetadata;
    if (!lastKnownBaseSha && !lastKnownMergeCommitSha) {
      return undefined;
    }
    return {
      [primaryRepo]: {
        lastKnownBaseSha: lastKnownBaseSha ?? undefined,
        lastKnownMergeCommitSha: lastKnownMergeCommitSha ?? undefined,
      },
    };
  }, [primaryRepo, baseBranchMetadata]);

  const hasDiffSources =
    Boolean(primaryRepo) &&
    Boolean(normalizedBaseBranch) &&
    Boolean(normalizedHeadBranch);

  const shouldPrefixDiffs = repoFullNames.length > 1;

  if (!selectedRun || !normalizedHeadBranch) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Select a run to view git diffs
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-neutral-900">
      {pullRequests && pullRequests.length > 0 ? (
        <div className="max-h-64 overflow-y-auto border-b border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          {pullRequests.map((pr) => (
            <WorkflowRunsWrapper
              key={`${pr.repoFullName}:${pr.number}`}
              teamSlugOrId={teamSlugOrId}
              repoFullName={pr.repoFullName}
              prNumber={pr.number}
              headSha={pr.headSha ?? undefined}
              checksExpandedByRepo={checksExpandedByRepo}
              setChecksExpandedByRepo={setChecksExpandedByRepo}
            />
          ))}
        </div>
      ) : null}
      {screenshotSetsLoading ? (
        <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/40 px-3.5 py-3 text-sm text-neutral-500 dark:text-neutral-400">
          Loading screenshots...
        </div>
      ) : (
        <RunScreenshotGallery
          screenshotSets={screenshotSets}
          highlightedSetId={selectedRun.latestScreenshotSetId ?? null}
        />
      )}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0">
          {hasDiffSources ? (
            <RunDiffSection
              repoFullName={primaryRepo as string}
              additionalRepoFullNames={additionalRepos}
              withRepoPrefix={shouldPrefixDiffs}
              ref1={normalizedBaseBranch as string}
              ref2={normalizedHeadBranch}
              metadataByRepo={metadataByRepo}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-600 dark:text-neutral-300">
              Missing repo or branches to show diff.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
