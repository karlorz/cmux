import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useRQ } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import z from "zod";
import { ChevronDown, ChevronUp, Shield } from "lucide-react";
import { ActivityStream } from "@/components/ActivityStream";
import { CompactErrorFallback, ErrorBoundary } from "@/components/ErrorBoundary";
import { LiveDiffStats } from "@/components/LiveDiffStats";
import { CostEstimationCard } from "@/components/dashboard/CostEstimationCard";
import { ResourceUsageCard } from "@/components/dashboard/ResourceUsageCard";
import { SessionBindingCard } from "@/components/dashboard/SessionBindingCard";
import { RuntimeLifecycleCard } from "@/components/dashboard/RuntimeLifecycleCard";
import { LineageChainCard } from "@/components/dashboard/LineageChainCard";
import { ApprovalRequestCard } from "@/components/orchestration/ApprovalRequestCard";
import { convexQueryClient } from "@/contexts/convex/convex-query-client";

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
});

export const Route = createFileRoute(
  "/_layout/$teamSlugOrId/task/$taskId/run/$runId/activity"
)({
  component: TaskRunActivity,
  params: {
    parse: paramsSchema.parse,
    stringify: (params) => ({
      taskId: params.taskId,
      runId: params.runId,
    }),
  },
  loader: async (opts) => {
    const { params } = opts;
    const { runId, teamSlugOrId, taskId } = params;

    // Prewarm queries
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRunActivity.getByTaskRunAsc,
      args: { taskRunId: runId, limit: 200 },
    });
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRuns.getByTask,
      args: { teamSlugOrId, taskId },
    });
    convexQueryClient.convexClient.prewarmQuery({
      query: api.approvalBroker.getByTaskRun,
      args: { teamSlugOrId, taskRunId: runId },
    });
  },
});

function TaskRunActivity() {
  const { runId: taskRunId, teamSlugOrId, taskId } = Route.useParams();
  const [showMetrics, setShowMetrics] = useState(false);
  const resetKey = `${taskId}-${taskRunId}`;

  // Get task runs to find sandbox info
  const taskRunsQuery = useRQ({
    ...convexQuery(api.taskRuns.getByTask, { teamSlugOrId, taskId }),
    enabled: Boolean(teamSlugOrId && taskId),
  });

  const selectedRun = useMemo(() => {
    return taskRunsQuery.data?.find((run) => run._id === taskRunId);
  }, [taskRunsQuery.data, taskRunId]);

  const sandboxId = selectedRun?.vscode?.containerName;
  const isRunning = selectedRun?.vscode?.status === "running";

  return (
    <div className="flex grow min-h-0 flex-col bg-neutral-50 dark:bg-black">
      <ErrorBoundary
        key={`${resetKey}-live-diff`}
        name="Live Diff"
        fallback={<CompactErrorFallback name="Live Diff" />}
      >
        <LiveDiffStats sandboxId={sandboxId} isRunning={isRunning} />
      </ErrorBoundary>

      {/* Collapsible Resource Metrics Panel */}
      <div className="px-4 pt-2 pb-1">
        <button
          type="button"
          onClick={() => setShowMetrics(!showMetrics)}
          className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          {showMetrics ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          <span>{showMetrics ? "Hide" : "Show"} Resource & Cost Metrics</span>
        </button>
      </div>

      {showMetrics && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <ErrorBoundary
              key={`${resetKey}-resource-usage`}
              name="Resource Usage"
              fallback={<CompactErrorFallback name="Resource Usage" />}
            >
              <ResourceUsageCard taskRunId={taskRunId} />
            </ErrorBoundary>
            <ErrorBoundary
              key={`${resetKey}-cost-estimation`}
              name="Cost Estimation"
              fallback={<CompactErrorFallback name="Cost Estimation" />}
            >
              <CostEstimationCard taskRunId={taskRunId} teamSlugOrId={teamSlugOrId} />
            </ErrorBoundary>
            <ErrorBoundary
              key={`${resetKey}-session-binding`}
              name="Session Binding"
              fallback={<CompactErrorFallback name="Session Binding" />}
            >
              <SessionBindingCard taskRunId={taskRunId} teamSlugOrId={teamSlugOrId} />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Shared run-control surface */}
      <div className="px-4 pb-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <ErrorBoundary
          key={`${resetKey}-runtime-lifecycle`}
          name="Runtime Lifecycle"
          fallback={<CompactErrorFallback name="Runtime Lifecycle" />}
        >
          <RuntimeLifecycleCard taskRunId={taskRunId} teamSlugOrId={teamSlugOrId} />
        </ErrorBoundary>
        <ErrorBoundary
          key={`${resetKey}-lineage-chain`}
          name="Run Lineage"
          fallback={<CompactErrorFallback name="Run Lineage" />}
        >
          <LineageChainCard taskRunId={taskRunId} teamSlugOrId={teamSlugOrId} />
        </ErrorBoundary>
      </div>

      <ErrorBoundary
        key={`${resetKey}-run-approval-lane`}
        name="Run-control approvals"
        fallback={<CompactErrorFallback name="Run-control approvals" />}
      >
        <RunApprovalLane taskRunId={taskRunId} teamSlugOrId={teamSlugOrId} />
      </ErrorBoundary>

      <ErrorBoundary
        key={`${resetKey}-activity-stream`}
        name="Activity Stream"
        fallback={<CompactErrorFallback name="Activity Stream" />}
      >
        <ActivityStream taskRunId={taskRunId} provider={selectedRun?.vscode?.provider} />
      </ErrorBoundary>
    </div>
  );
}

function RunApprovalLane({
  taskRunId,
  teamSlugOrId,
}: {
  taskRunId: z.infer<typeof paramsSchema>["runId"];
  teamSlugOrId: string;
}) {
  const approvalsQuery = useRQ({
    ...convexQuery(api.approvalBroker.getByTaskRun, {
      teamSlugOrId,
      taskRunId,
    }),
    enabled: Boolean(teamSlugOrId && taskRunId),
  });

  const approvals = useMemo(() => {
    if (!approvalsQuery.data) {
      return [];
    }

    return [...approvalsQuery.data].sort((left, right) => {
      if (left.status === right.status) {
        return right.createdAt - left.createdAt;
      }
      if (left.status === "pending") {
        return -1;
      }
      if (right.status === "pending") {
        return 1;
      }
      return right.createdAt - left.createdAt;
    });
  }, [approvalsQuery.data]);

  if (approvalsQuery.error) {
    throw approvalsQuery.error;
  }

  if (approvalsQuery.isLoading) {
    return (
      <div className="px-4 pb-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2">
            <div className="size-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="h-4 w-40 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
          </div>
        </div>
      </div>
    );
  }

  if (approvals.length === 0) {
    return null;
  }

  const pendingCount = approvals.filter((approval) => approval.status === "pending").length;

  return (
    <div className="px-4 pb-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Run-control approvals
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {pendingCount > 0
              ? "Resolve the current approval request before continuing the run."
              : "Approval history recorded for this run."}
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          {pendingCount > 0
            ? `${pendingCount} pending`
            : `${approvals.length} recorded`}
        </span>
      </div>

      <div className="space-y-2">
        {approvals.map((approval) => (
          <ApprovalRequestCard
            key={approval._id}
            onResolved={() => {
              void approvalsQuery.refetch();
            }}
            request={approval}
            teamSlugOrId={teamSlugOrId}
          />
        ))}
      </div>
    </div>
  );
}
