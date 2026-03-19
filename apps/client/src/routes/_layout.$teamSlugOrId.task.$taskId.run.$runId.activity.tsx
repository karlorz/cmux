import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useRQ } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import z from "zod";
import { ActivityStream } from "@/components/ActivityStream";
import { LiveDiffStats } from "@/components/LiveDiffStats";
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
      <LiveDiffStats sandboxId={sandboxId} isRunning={isRunning} />
      <ActivityStream taskRunId={taskRunId} />
    </div>
  );
}
