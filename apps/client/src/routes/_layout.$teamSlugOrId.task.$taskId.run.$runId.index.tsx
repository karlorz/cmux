import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import z from "zod";
import { RunDashboard } from "@/components/RunDashboard";
import { convexQueryClient } from "@/contexts/convex/convex-query-client";

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
});

export const Route = createFileRoute(
  "/_layout/$teamSlugOrId/task/$taskId/run/$runId/"
)({
  component: RunDetailDashboard,
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
      query: api.taskRuns.get,
      args: { teamSlugOrId, id: runId },
    });
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRuns.getByTask,
      args: { teamSlugOrId, taskId },
    });
    convexQueryClient.convexClient.prewarmQuery({
      query: api.tasks.getById,
      args: { teamSlugOrId, id: taskId },
    });
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRunActivity.getByTaskRunAsc,
      args: { taskRunId: runId, limit: 200 },
    });
    convexQueryClient.convexClient.prewarmQuery({
      query: api.approvalBroker.getByTaskRun,
      args: { teamSlugOrId, taskRunId: runId },
    });
  },
});

function RunDetailDashboard() {
  const { runId: taskRunId, teamSlugOrId, taskId } = Route.useParams();
  const navigate = useNavigate();

  const handleOpenWorkspace = useCallback(() => {
    navigate({
      to: "/$teamSlugOrId/task/$taskId/run/$runId/vscode",
      params: { teamSlugOrId, taskId, runId: taskRunId },
    });
  }, [navigate, teamSlugOrId, taskId, taskRunId]);

  return (
    <RunDashboard
      taskRunId={taskRunId}
      teamSlugOrId={teamSlugOrId}
      taskId={taskId}
      onOpenWorkspace={handleOpenWorkspace}
    />
  );
}
