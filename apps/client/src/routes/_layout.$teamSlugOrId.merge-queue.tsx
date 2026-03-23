import { FloatingPane } from "@/components/floating-pane";
import { MergeQueueList } from "@/components/merge-queue/MergeQueueList";
import { TitleBar } from "@/components/TitleBar";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/$teamSlugOrId/merge-queue")({
  component: MergeQueuePage,
});

function MergeQueuePage() {
  const { teamSlugOrId } = Route.useParams();

  return (
    <FloatingPane header={<TitleBar title="Merge Queue" />}>
      <MergeQueueList teamSlugOrId={teamSlugOrId} />
    </FloatingPane>
  );
}
