import { api } from "@cmux/convex/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useRQ } from "@tanstack/react-query";
import { useMemo } from "react";

export type CombinedRun = {
  type: "workflow" | "check" | "deployment" | "status";
  status?: string | null;
  conclusion?: string | null;
  timestamp?: number | null;
  url?: string | null;
  name?: string | null;
  workflowName?: string | null;
  runDuration?: number | null;
  [key: string]: unknown;
};

type WorkflowRunsHookProps = {
  teamSlugOrId: string;
  repoFullName?: string | null;
  prNumber?: number | null;
  headSha?: string | null;
  enabled?: boolean;
};

export function useCombinedWorkflowData({
  teamSlugOrId,
  repoFullName,
  prNumber,
  headSha,
  enabled = true,
}: WorkflowRunsHookProps): { allRuns: CombinedRun[]; isLoading: boolean } {
  const normalizedRepoFullName = repoFullName?.trim() ?? "";
  const normalizedPrNumber = typeof prNumber === "number" ? prNumber : 0;
  const shouldFetch = Boolean(enabled && normalizedRepoFullName && normalizedPrNumber > 0);

  const baseArgs = {
    teamSlugOrId,
    repoFullName: normalizedRepoFullName,
    prNumber: normalizedPrNumber,
    headSha: headSha ?? undefined,
    limit: 50,
  };

  const workflowRunsQuery = useRQ({
    ...convexQuery(api.github_workflows.getWorkflowRunsForPr, baseArgs),
    enabled: shouldFetch,
  });
  const checkRunsQuery = useRQ({
    ...convexQuery(api.github_check_runs.getCheckRunsForPr, baseArgs),
    enabled: shouldFetch,
  });
  const deploymentsQuery = useRQ({
    ...convexQuery(api.github_deployments.getDeploymentsForPr, baseArgs),
    enabled: shouldFetch,
  });
  const commitStatusesQuery = useRQ({
    ...convexQuery(api.github_commit_statuses.getCommitStatusesForPr, baseArgs),
    enabled: shouldFetch,
  });

  const allRuns = useMemo<CombinedRun[]>(() => {
    if (!shouldFetch) {
      return [];
    }

    const workflowItems = ((workflowRunsQuery.data ?? []) as Array<Record<string, unknown>>).map((run) => {
      return {
        ...run,
        type: "workflow" as const,
      } satisfies CombinedRun;
    });

    const checkItems = ((checkRunsQuery.data ?? []) as Array<Record<string, unknown>>).map((run) => {
      const url = typeof run.htmlUrl === "string" && run.htmlUrl.length > 0
        ? run.htmlUrl
        : (normalizedRepoFullName && normalizedPrNumber > 0 && typeof run.checkRunId === "number")
          ? `https://github.com/${normalizedRepoFullName}/pull/${normalizedPrNumber}/checks?check_run_id=${run.checkRunId}`
          : undefined;
      return {
        ...run,
        type: "check" as const,
        url,
      } satisfies CombinedRun;
    });

    const deploymentItems = ((deploymentsQuery.data ?? []) as Array<Record<string, unknown>>)
      .filter((dep) => dep.environment !== "Preview")
      .map((dep) => {
        const state = dep.state as string | undefined;
        const conclusion = state === "success"
          ? "success"
          : state === "failure" || state === "error"
            ? "failure"
            : undefined;
        const status = state === "pending" || state === "queued" || state === "in_progress"
          ? "in_progress"
          : "completed";
        return {
          ...dep,
          type: "deployment" as const,
          name: (dep.description as string | undefined) || (dep.environment as string | undefined) || "Deployment",
          status,
          conclusion,
        } satisfies CombinedRun;
      });

    const statusItems = ((commitStatusesQuery.data ?? []) as Array<Record<string, unknown>>).map((status) => {
      const state = status.state as string | undefined;
      return {
        ...status,
        type: "status" as const,
        name: status.context as string | undefined,
        timestamp: status.updatedAt as number | undefined,
        status: state === "pending" ? "in_progress" : "completed",
        conclusion:
          state === "success"
            ? "success"
            : state === "failure" || state === "error"
              ? "failure"
              : undefined,
      } satisfies CombinedRun;
    });

    return [
      ...workflowItems,
      ...checkItems,
      ...deploymentItems,
      ...statusItems,
    ];
  }, [
    shouldFetch,
    workflowRunsQuery.data,
    checkRunsQuery.data,
    deploymentsQuery.data,
    commitStatusesQuery.data,
    normalizedRepoFullName,
    normalizedPrNumber,
  ]);

  const isLoading = shouldFetch && (
    workflowRunsQuery.isPending ||
    checkRunsQuery.isPending ||
    deploymentsQuery.isPending ||
    commitStatusesQuery.isPending
  );

  return { allRuns, isLoading };
}
