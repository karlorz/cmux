import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@cmux/convex";
import { Doc } from "@cmux/convex";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_layout/$teamSlugOrId/kanban")({
  component: KanbanBoard,
});

type MergeStatus = Doc<"tasks">["mergeStatus"];

interface TasksByCategory {
  workspaces: Doc<"tasks">[];
  readyToReview: Doc<"tasks">[];
  inProgress: Doc<"tasks">[];
  merged: Doc<"tasks">[];
}

function categorizeTask(task: Doc<"tasks">): keyof TasksByCategory {
  const status = task.mergeStatus;

  if (!status || status === "none" || status === "pr_closed") {
    return "workspaces";
  }

  if (status === "pr_open" || status === "pr_approved") {
    return "readyToReview";
  }

  if (status === "pr_draft" || status === "pr_changes_requested") {
    return "inProgress";
  }

  if (status === "pr_merged") {
    return "merged";
  }

  return "workspaces";
}

function KanbanBoard() {
  const { teamSlugOrId } = Route.useParams();
  const tasks = useQuery(api.tasks.get, { teamSlugOrId });

  const categorizedTasks: TasksByCategory = {
    workspaces: [],
    readyToReview: [],
    inProgress: [],
    merged: [],
  };

  if (tasks) {
    tasks.forEach((task) => {
      const category = categorizeTask(task);
      categorizedTasks[category].push(task);
    });
  }

  const columns = [
    {
      key: "workspaces" as const,
      title: "Workspaces",
      color: "bg-neutral-100 dark:bg-neutral-800",
      count: categorizedTasks.workspaces.length,
    },
    {
      key: "readyToReview" as const,
      title: "Ready to Review",
      color: "bg-blue-50 dark:bg-blue-950",
      count: categorizedTasks.readyToReview.length,
    },
    {
      key: "inProgress" as const,
      title: "In Progress",
      color: "bg-yellow-50 dark:bg-yellow-950",
      count: categorizedTasks.inProgress.length,
    },
    {
      key: "merged" as const,
      title: "Merged",
      color: "bg-green-50 dark:bg-green-950",
      count: categorizedTasks.merged.length,
    },
  ];

  return (
    <div className="h-full w-full overflow-hidden bg-neutral-50 dark:bg-neutral-900 p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
          Task Board
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-1">
          Manage your tasks across different stages
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-[calc(100%-6rem)]">
        {columns.map((column) => (
          <div
            key={column.key}
            className="flex flex-col h-full min-h-0 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
          >
            <div className={cn("px-4 py-3 rounded-t-lg border-b border-neutral-200 dark:border-neutral-700", column.color)}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {column.title}
                </h2>
                <Badge variant="secondary" className="ml-2">
                  {column.count}
                </Badge>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {categorizedTasks[column.key].length === 0 ? (
                <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">
                  No tasks
                </div>
              ) : (
                categorizedTasks[column.key].map((task) => (
                  <TaskCard key={task._id} task={task} />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Doc<"tasks"> }) {
  const formatDate = (timestamp: number) => {
    try {
      return formatDistanceToNow(timestamp, { addSuffix: true });
    } catch {
      return "recently";
    }
  };

  const statusColors: Record<MergeStatus, string> = {
    none: "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200",
    pr_draft: "bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    pr_open: "bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    pr_approved: "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200",
    pr_changes_requested: "bg-orange-200 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    pr_merged: "bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    pr_closed: "bg-neutral-300 text-neutral-700 dark:bg-neutral-600 dark:text-neutral-300",
  };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 line-clamp-2 flex-1">
            {task.title || task.prompt || "Untitled Task"}
          </h3>
        </div>

        {task.mergeStatus && task.mergeStatus !== "none" && (
          <Badge
            variant="outline"
            className={cn("text-xs", statusColors[task.mergeStatus])}
          >
            {task.mergeStatus.replace("pr_", "").replace("_", " ")}
          </Badge>
        )}

        {task.prompt && (
          <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
            {task.prompt}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 pt-2 border-t border-neutral-100 dark:border-neutral-700">
          <span>{formatDate(task._creationTime)}</span>
          {task.branch && (
            <span className="truncate ml-2 font-mono bg-neutral-100 dark:bg-neutral-700 px-2 py-0.5 rounded">
              {task.branch}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
