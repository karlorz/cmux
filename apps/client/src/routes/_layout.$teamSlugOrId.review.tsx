import { FloatingPane } from "@/components/floating-pane";
import { SwipeReviewUI } from "@/components/swipe-review/swipe-review-ui";
import { convexQueryClient } from "@/contexts/convex/convex-query-client";
import { api } from "@cmux/convex/api";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  sessionId: z.string().optional(),
  taskRunId: z.string().optional(),
});

export const Route = createFileRoute("/_layout/$teamSlugOrId/review")({
  component: ReviewPage,
  validateSearch: searchSchema,
  loader: async (opts) => {
    const { teamSlugOrId } = opts.params;
    // Prewarm review sessions list
    convexQueryClient.convexClient.prewarmQuery({
      query: api.prReviewSessions.list,
      args: { teamSlugOrId },
    });
  },
});

function ReviewPage() {
  const { teamSlugOrId } = Route.useParams();
  const { sessionId, taskRunId } = Route.useSearch();

  return (
    <FloatingPane>
      <div className="flex flex-1 min-h-0 h-full flex-col">
        <SwipeReviewUI
          teamSlugOrId={teamSlugOrId}
          sessionId={sessionId}
          taskRunId={taskRunId}
        />
      </div>
    </FloatingPane>
  );
}
