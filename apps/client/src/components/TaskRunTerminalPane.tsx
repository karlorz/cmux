import { Suspense } from "react";
import { MonitorUp } from "lucide-react";
import type { Id } from "@cmux/convex/dataModel";
import { TaskRunTerminalsPane } from "@/routes/_layout.$teamSlugOrId.task.$taskId.run.$runId.terminals";

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
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
        <MonitorUp className="size-4 animate-pulse" aria-hidden />
        <span>Select a run to connect a terminal session.</span>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
          <MonitorUp className="size-4 animate-pulse" aria-hidden />
          <span>Loading terminal…</span>
        </div>
      }
    >
      <TaskRunTerminalsPane
        teamSlugOrId={teamSlugOrId}
        taskRunId={taskRunId}
      />
    </Suspense>
  );
}
