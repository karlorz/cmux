import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { ActivityStream } from "@/components/ActivityStream";
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
    const { runId } = params;

    // Prewarm the activity query
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRunActivity.getByTaskRunAsc,
      args: { taskRunId: runId, limit: 200 },
    });
  },
});

function TaskRunActivity() {
  const { runId: taskRunId } = Route.useParams();

  return (
    <div className="flex grow min-h-0 flex-col bg-neutral-50 dark:bg-black">
      <ActivityStream taskRunId={taskRunId} />
    </div>
  );
}
