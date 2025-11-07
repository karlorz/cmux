import type { Id } from "@cmux/convex/dataModel";
import { MonitorUp } from "lucide-react";
import { TaskRunTerminalsView } from "@/routes/_layout.$teamSlugOrId.task.$taskId.run.$runId.terminals";

export interface TaskRunTerminalPaneProps {
  teamSlugOrId: string;
  taskRunId: Id<"taskRuns"> | null;
}

export function TaskRunTerminalPane({
  teamSlugOrId,
  taskRunId,
}: TaskRunTerminalPaneProps) {
  if (!taskRunId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
        <MonitorUp className="size-4" aria-hidden />
        <span>Select a run to open terminals.</span>
      </div>
    );
  }

  return (
    <TaskRunTerminalsView
      key={taskRunId}
      teamSlugOrId={teamSlugOrId}
      taskRunId={taskRunId}
    />
  );
}
