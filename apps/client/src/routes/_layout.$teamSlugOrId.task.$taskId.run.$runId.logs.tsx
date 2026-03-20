/**
 * Task Run Logs Route
 *
 * Web-based log viewing page for task run activity.
 * Integrates the WebLogsPage component from Q4 features.
 */

import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useRQ } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import z from "zod";
import { WebLogsPage } from "@/components/log-viewer/WebLogsPage";
import { convexQueryClient } from "@/contexts/convex/convex-query-client";

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
});

export const Route = createFileRoute(
  "/_layout/$teamSlugOrId/task/$taskId/run/$runId/logs"
)({
  component: TaskRunLogsPage,
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

    // Prewarm queries for logs
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRunActivity.getByTaskRunAsc,
      args: { taskRunId: runId, limit: 1000 },
    });
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRuns.getByTask,
      args: { teamSlugOrId, taskId },
    });
  },
});

function TaskRunLogsPage() {
  const { runId: taskRunId, teamSlugOrId, taskId } = Route.useParams();

  // Get task runs to find team ID
  const taskRunsQuery = useRQ({
    ...convexQuery(api.taskRuns.getByTask, { teamSlugOrId, taskId }),
    enabled: Boolean(teamSlugOrId && taskId),
  });

  const selectedRun = useMemo(() => {
    return taskRunsQuery.data?.find((run) => run._id === taskRunId);
  }, [taskRunsQuery.data, taskRunId]);

  const teamId = selectedRun?.teamId ?? teamSlugOrId;

  return (
    <div className="flex grow min-h-0 flex-col bg-neutral-50 dark:bg-black p-4">
      <WebLogsPage taskRunId={taskRunId} teamId={teamId} />
    </div>
  );
}
