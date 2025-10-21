import type { Id } from "@cmux/convex/dataModel";

export interface ElectronTaskCrownNotificationPayload {
  teamSlugOrId: string;
  taskId: Id<"tasks">;
  taskRunId: Id<"taskRuns">;
  taskTitle: string;
  agentName?: string | null;
  crownReason?: string | null;
}
