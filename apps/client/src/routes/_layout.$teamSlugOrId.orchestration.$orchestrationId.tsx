import { FloatingPane } from "@/components/floating-pane";
import { OrchestrationDashboard } from "@/components/orchestration/OrchestrationDashboard";
import { TitleBar } from "@/components/TitleBar";
import { api } from "@cmux/convex/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute(
  "/_layout/$teamSlugOrId/orchestration/$orchestrationId"
)({
  component: OrchestrationSessionPage,
  validateSearch: z.object({
    status: z
      .enum([
        "pending",
        "assigned",
        "running",
        "completed",
        "failed",
        "cancelled",
        "all",
      ])
      .optional(),
  }),
});

function OrchestrationSessionPage() {
  const { teamSlugOrId, orchestrationId } = Route.useParams();
  const { status } = Route.useSearch();

  // Prefetch orchestration summary for faster dashboard loading
  const { data: summary, isLoading: summaryLoading } = useQuery(
    convexQuery(api.orchestrationQueries.getOrchestrationSummary, {
      teamSlugOrId,
    })
  );

  // Prefetch tasks list filtered by orchestrationId
  const { data: allTasks, isLoading: tasksLoading } = useQuery(
    convexQuery(api.orchestrationQueries.listTasksWithDependencyInfo, {
      teamSlugOrId,
      status: status === "all" ? undefined : status,
      limit: 100,
    })
  );

  // Filter tasks to only show those belonging to this orchestration
  const tasks = allTasks?.filter((task) => {
    const meta = task.metadata as { orchestrationId?: string } | undefined;
    return meta?.orchestrationId === orchestrationId;
  });

  return (
    <FloatingPane
      header={
        <TitleBar
          title={`Orchestration: ${orchestrationId.slice(0, 12)}...`}
        />
      }
    >
      <OrchestrationDashboard
        teamSlugOrId={teamSlugOrId}
        summary={summary}
        summaryLoading={summaryLoading}
        tasks={tasks}
        tasksLoading={tasksLoading}
        statusFilter={status ?? "all"}
        orchestrationId={orchestrationId}
      />
    </FloatingPane>
  );
}
