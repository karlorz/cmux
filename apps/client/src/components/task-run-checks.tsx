import { WorkflowRunsSection } from "@/components/prs/workflow-runs-section";
import { useCombinedWorkflowData } from "@/components/prs/useCombinedWorkflowData";
import type { StoredPullRequestInfo } from "@cmux/shared";
import { useMemo, useState, useCallback } from "react";

interface TaskRunChecksProps {
  teamSlugOrId: string;
  pullRequests?: StoredPullRequestInfo[] | null;
  headShaByRepo?: Record<string, string | undefined>;
}

interface TaskRunChecksForRepoProps {
  teamSlugOrId: string;
  repoFullName: string;
  prNumber: number;
  headSha?: string;
}

function TaskRunChecksForRepo({
  teamSlugOrId,
  repoFullName,
  prNumber,
  headSha,
}: TaskRunChecksForRepoProps) {
  const workflowData = useCombinedWorkflowData({
    teamSlugOrId,
    repoFullName,
    prNumber,
    headSha,
  });

  const hasAnyFailure = useMemo(
    () =>
      workflowData.allRuns.some(
        (run) =>
          run.conclusion === "failure" ||
          run.conclusion === "timed_out" ||
          run.conclusion === "action_required",
      ),
    [workflowData.allRuns],
  );

  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);
  const isExpanded = expandedOverride !== null ? expandedOverride : hasAnyFailure;

  const handleToggle = useCallback(() => {
    setExpandedOverride((current) => (current === null ? !isExpanded : !current));
  }, [isExpanded]);

  const hasAnyRuns = workflowData.allRuns.length > 0;

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-800 first:border-t-0">
      <div className="px-3.5 py-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        {repoFullName}#{prNumber}
      </div>
      {hasAnyRuns || workflowData.isLoading ? (
        <WorkflowRunsSection
          allRuns={workflowData.allRuns}
          isLoading={workflowData.isLoading}
          isExpanded={isExpanded}
          onToggle={handleToggle}
          className="bg-white dark:bg-neutral-950"
        />
      ) : (
        <div className="px-3.5 py-2 text-xs text-neutral-500 dark:text-neutral-400 border-y border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
          No checks reported yet
        </div>
      )}
    </div>
  );
}

export function TaskRunChecks({
  teamSlugOrId,
  pullRequests,
  headShaByRepo,
}: TaskRunChecksProps) {
  const relevantPullRequests = useMemo<Array<StoredPullRequestInfo & { number: number }>>(() => {
    if (!pullRequests) {
      return [];
    }

    const items: Array<StoredPullRequestInfo & { number: number }> = [];

    for (const pr of pullRequests) {
      if (typeof pr.number !== "number" || !Number.isFinite(pr.number)) {
        continue;
      }

      const trimmedRepo = pr.repoFullName?.trim();
      if (!trimmedRepo) {
        continue;
      }

      items.push({
        ...pr,
        repoFullName: trimmedRepo,
        number: pr.number,
      });
    }

    return items;
  }, [pullRequests]);

  if (relevantPullRequests.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
      <div className="px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        CI/CD checks
      </div>
      {relevantPullRequests.map((pr) => (
        <TaskRunChecksForRepo
          key={`${pr.repoFullName}#${pr.number}`}
          teamSlugOrId={teamSlugOrId}
          repoFullName={pr.repoFullName}
          prNumber={pr.number}
          headSha={headShaByRepo?.[pr.repoFullName]}
        />
      ))}
    </div>
  );
}
