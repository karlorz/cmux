import { FloatingPane } from "@/components/floating-pane";
import { ScheduledTasksDashboard } from "@/components/scheduled-tasks/ScheduledTasksDashboard";
import { TitleBar } from "@/components/TitleBar";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/$teamSlugOrId/scheduled-tasks")({
  component: ScheduledTasksPage,
});

function ScheduledTasksPage() {
  const { teamSlugOrId } = Route.useParams();

  return (
    <FloatingPane header={<TitleBar title="Scheduled Tasks" />}>
      <ScheduledTasksDashboard teamSlugOrId={teamSlugOrId} />
    </FloatingPane>
  );
}
