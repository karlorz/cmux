import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useRQ } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import z from "zod";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ActivityStream } from "@/components/ActivityStream";
import { CompactErrorFallback, ErrorBoundary } from "@/components/ErrorBoundary";
import { LiveDiffStats } from "@/components/LiveDiffStats";
import { CostEstimationCard } from "@/components/dashboard/CostEstimationCard";
import { ResourceUsageCard } from "@/components/dashboard/ResourceUsageCard";
import { SessionBindingCard } from "@/components/dashboard/SessionBindingCard";
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

      <ErrorBoundary
        key={`${resetKey}-activity-stream`}
        name="Activity Stream"
        fallback={<CompactErrorFallback name="Activity Stream" />}
      >
        <ActivityStream taskRunId={taskRunId} />
      </ErrorBoundary>
    </div>
  );
}
