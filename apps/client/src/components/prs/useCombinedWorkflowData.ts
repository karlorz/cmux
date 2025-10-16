import { api } from "@cmux/convex/api";
import { useQuery as useConvexQuery } from "convex/react";
import { useMemo } from "react";

type QueryRecord = Record<string, unknown>;

const toString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const toNumber = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const toRecords = (value: unknown): QueryRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is QueryRecord =>
    typeof item === "object" && item !== null,
  );
};

export type CombinedRun = QueryRecord & {
  type: "workflow" | "check" | "deployment" | "status";
  name?: string;
  timestamp?: number;
  url?: string;
  status?: string;
  conclusion?: string;
  runDuration?: number;
  appSlug?: string;
  appName?: string;
};

export interface CombinedWorkflowDataResult {
  allRuns: CombinedRun[];
  isLoading: boolean;
}

export interface CombinedWorkflowDataArgs {
  teamSlugOrId: string;
  repoFullName: string;
  prNumber: number;
  headSha?: string;
}

export function useCombinedWorkflowData({
  teamSlugOrId,
  repoFullName,
  prNumber,
  headSha,
}: CombinedWorkflowDataArgs): CombinedWorkflowDataResult {
  const workflowRuns = useConvexQuery(api.github_workflows.getWorkflowRunsForPr, {
    teamSlugOrId,
    repoFullName,
    prNumber,
    headSha,
    limit: 50,
  });

  const checkRuns = useConvexQuery(api.github_check_runs.getCheckRunsForPr, {
    teamSlugOrId,
    repoFullName,
    prNumber,
    headSha,
    limit: 50,
  });

  const deployments = useConvexQuery(api.github_deployments.getDeploymentsForPr, {
    teamSlugOrId,
    repoFullName,
    prNumber,
    headSha,
    limit: 50,
  });

  const commitStatuses = useConvexQuery(api.github_commit_statuses.getCommitStatusesForPr, {
    teamSlugOrId,
    repoFullName,
    prNumber,
    headSha,
    limit: 50,
  });

  const isLoading =
    workflowRuns === undefined ||
    checkRuns === undefined ||
    deployments === undefined ||
    commitStatuses === undefined;

  const allRuns = useMemo<CombinedRun[]>(() => {
    const workflowEntries: CombinedRun[] = toRecords(workflowRuns).map(
      (record) => ({
        ...record,
        type: "workflow" as const,
        name: toString(record["workflowName"]),
        timestamp: toNumber(record["runStartedAt"]),
        url: toString(record["htmlUrl"]),
        status: toString(record["status"]),
        conclusion: toString(record["conclusion"]),
        runDuration: toNumber(record["runDuration"]),
      }),
    );

    const checkRunEntries: CombinedRun[] = toRecords(checkRuns).map(
      (record) => {
        const fallbackUrl =
          record["checkRunId"] !== undefined
            ? `https://github.com/${repoFullName}/pull/${prNumber}/checks?check_run_id=${record["checkRunId"]}`
            : undefined;

        return {
          ...record,
          type: "check" as const,
          timestamp: toNumber(record["startedAt"]),
          url: toString(record["htmlUrl"]) || fallbackUrl,
          status: toString(record["status"]),
          conclusion: toString(record["conclusion"]),
          appSlug: toString(record["appSlug"]),
          appName: toString(record["appName"]),
        };
      },
    );

    const deploymentEntries: CombinedRun[] = toRecords(deployments)
      .filter((record) => toString(record["environment"]) !== "Preview")
      .map((record) => {
        const state = toString(record["state"]);
        const status =
          state === "pending" || state === "queued" || state === "in_progress"
            ? "in_progress"
            : "completed";
        const conclusion =
          state === "success"
            ? "success"
            : state === "failure" || state === "error"
              ? "failure"
              : undefined;

        return {
          ...record,
          type: "deployment" as const,
          name:
            toString(record["description"]) ||
            toString(record["environment"]) ||
            "Deployment",
          timestamp: toNumber(record["createdAt"]),
          status,
          conclusion,
          url: toString(record["targetUrl"]),
        };
      });

    const commitStatusEntries: CombinedRun[] = toRecords(commitStatuses).map(
      (record) => {
        const state = toString(record["state"]);
        const status = state === "pending" ? "in_progress" : "completed";
        const conclusion =
          state === "success"
            ? "success"
            : state === "failure" || state === "error"
              ? "failure"
              : undefined;

        return {
          ...record,
          type: "status" as const,
          name: toString(record["context"]),
          timestamp: toNumber(record["updatedAt"]),
          status,
          conclusion,
          url: toString(record["targetUrl"]),
        };
      },
    );

    return [
      ...workflowEntries,
      ...checkRunEntries,
      ...deploymentEntries,
      ...commitStatusEntries,
    ];
  }, [workflowRuns, checkRuns, deployments, commitStatuses, repoFullName, prNumber]);

  return { allRuns, isLoading };
}
