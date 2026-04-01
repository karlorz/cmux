import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Crown, Users, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import clsx from "clsx";
import { OrchestrationTaskRow } from "./OrchestrationTaskRow";
import type { OrchestrationTaskWithDeps } from "./OrchestrationDashboard";

interface OrchestrationSessionGroupProps {
  headTask: OrchestrationTaskWithDeps;
  childTasks: OrchestrationTaskWithDeps[];
  teamSlugOrId: string;
  defaultExpanded?: boolean;
}

function getSessionProgress(tasks: OrchestrationTaskWithDeps[]) {
  const counts = {
    total: tasks.length,
    completed: 0,
    failed: 0,
    running: 0,
    pending: 0,
  };

  for (const task of tasks) {
    if (task.status === "completed") counts.completed++;
    else if (task.status === "failed") counts.failed++;
    else if (task.status === "running" || task.status === "assigned") counts.running++;
    else counts.pending++;
  }

  return counts;
}

function getSessionStatus(headTask: OrchestrationTaskWithDeps, progress: ReturnType<typeof getSessionProgress>): {
  status: "running" | "completed" | "failed" | "pending";
  label: string;
  color: string;
} {
  // If head task has explicit status, use it
  if (headTask.status === "failed") {
    return { status: "failed", label: "Failed", color: "text-red-600 dark:text-red-400" };
  }
  if (headTask.status === "completed" && progress.failed === 0) {
    return { status: "completed", label: "Completed", color: "text-green-600 dark:text-green-400" };
  }
  if (progress.running > 0 || headTask.status === "running") {
    return { status: "running", label: "Running", color: "text-blue-600 dark:text-blue-400" };
  }
  if (progress.failed > 0) {
    return { status: "failed", label: `${progress.failed} Failed`, color: "text-red-600 dark:text-red-400" };
  }
  return { status: "pending", label: "Pending", color: "text-neutral-500 dark:text-neutral-400" };
}

export function OrchestrationSessionGroup({
  headTask,
  childTasks,
  teamSlugOrId,
  defaultExpanded = true,
}: OrchestrationSessionGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const allTasks = useMemo(() => [headTask, ...childTasks], [headTask, childTasks]);
  const progress = useMemo(() => getSessionProgress(allTasks), [allTasks]);
  const sessionStatus = useMemo(() => getSessionStatus(headTask, progress), [headTask, progress]);

  // Calculate duration
  const duration = useMemo(() => {
    const startTime = headTask.startedAt ?? headTask.createdAt;
    const endTime = headTask.completedAt ?? Date.now();
    const durationMs = endTime - startTime;

    if (durationMs < 60000) {
      return `${Math.round(durationMs / 1000)}s`;
    } else if (durationMs < 3600000) {
      return `${Math.round(durationMs / 60000)}m`;
    } else {
      return `${(durationMs / 3600000).toFixed(1)}h`;
    }
  }, [headTask]);

  // Truncate prompt for header
  const truncatedPrompt = useMemo(() => {
    const firstLine = headTask.prompt.split("\n")[0] ?? headTask.prompt;
    const clean = firstLine.trim();
    return clean.length > 80 ? `${clean.slice(0, 80)}...` : clean;
  }, [headTask.prompt]);

  const StatusIcon = sessionStatus.status === "running" ? Loader2
    : sessionStatus.status === "completed" ? CheckCircle2
    : sessionStatus.status === "failed" ? XCircle
    : Clock;

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      {/* Session Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={clsx(
          "w-full px-4 py-3 text-left transition-colors",
          "hover:bg-neutral-50 dark:hover:bg-neutral-800/50",
          sessionStatus.status === "running" && "bg-blue-50/30 dark:bg-blue-900/10"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Expand/collapse icon */}
          <div className="text-neutral-400">
            {expanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </div>

          {/* Head agent indicator */}
          <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Crown className="size-3" />
            <span>Head Agent</span>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <StatusIcon
              className={clsx(
                "size-4",
                sessionStatus.color,
                sessionStatus.status === "running" && "animate-spin"
              )}
            />
            <span className={clsx("text-xs font-medium", sessionStatus.color)}>
              {sessionStatus.label}
            </span>
          </div>

          {/* Agent name */}
          {headTask.assignedAgentName && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {headTask.assignedAgentName}
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Progress */}
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {progress.total} tasks
            </span>
            {progress.completed > 0 && (
              <span className="text-green-600 dark:text-green-400">
                {progress.completed} done
              </span>
            )}
            {progress.running > 0 && (
              <span className="text-blue-600 dark:text-blue-400">
                {progress.running} running
              </span>
            )}
            {progress.failed > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {progress.failed} failed
              </span>
            )}
          </div>

          {/* Duration */}
          <span className="text-xs text-neutral-400">
            {duration}
          </span>
        </div>

        {/* Goal prompt */}
        <div className="mt-1.5 ml-7 text-sm text-neutral-700 dark:text-neutral-300 line-clamp-1">
          {truncatedPrompt}
        </div>

        {/* Progress bar */}
        <div className="mt-2 ml-7 flex h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          {progress.completed > 0 && (
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${(progress.completed / progress.total) * 100}%` }}
            />
          )}
          {progress.running > 0 && (
            <div
              className="bg-blue-500 transition-all"
              style={{ width: `${(progress.running / progress.total) * 100}%` }}
            />
          )}
          {progress.failed > 0 && (
            <div
              className="bg-red-500 transition-all"
              style={{ width: `${(progress.failed / progress.total) * 100}%` }}
            />
          )}
        </div>
      </button>

      {/* Expanded task list */}
      {expanded && (
        <div className="divide-y divide-neutral-100 border-t border-neutral-100 bg-neutral-50/50 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900/50">
          {allTasks.map((task) => (
            <OrchestrationTaskRow
              key={task._id}
              task={task}
              teamSlugOrId={teamSlugOrId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
