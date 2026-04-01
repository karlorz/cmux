import { useMemo, useState } from "react";
import { Users, Layers, List } from "lucide-react";
import { OrchestrationTaskRow } from "./OrchestrationTaskRow";
import { OrchestrationSessionGroup } from "./OrchestrationSessionGroup";
import type { OrchestrationTaskWithDeps } from "./OrchestrationDashboard";

interface OrchestrationTaskListProps {
  teamSlugOrId: string;
  tasks?: OrchestrationTaskWithDeps[];
  loading: boolean;
}

interface ViewModeToggleProps {
  viewMode: "grouped" | "flat";
  onViewModeChange: (mode: "grouped" | "flat") => void;
}

function ViewModeToggle({ viewMode, onViewModeChange }: ViewModeToggleProps) {
  return (
    <div className="flex items-center justify-end gap-1 border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => onViewModeChange("grouped")}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
          viewMode === "grouped"
            ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
            : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
        title="Group by session"
      >
        <Layers className="size-3" />
        Sessions
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange("flat")}
        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
          viewMode === "flat"
            ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
            : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        }`}
        title="Flat list"
      >
        <List className="size-3" />
        Flat
      </button>
    </div>
  );
}

interface SessionGroup {
  headTask: OrchestrationTaskWithDeps;
  childTasks: OrchestrationTaskWithDeps[];
}

/**
 * Group tasks by their parent (head agent) task.
 * Tasks without a parentTaskId are considered potential head agents.
 * Tasks with a parentTaskId are grouped under their parent.
 * Orphan tasks (parentTaskId doesn't exist in current set) are shown ungrouped.
 */
function groupTasksBySession(tasks: OrchestrationTaskWithDeps[]): {
  sessions: SessionGroup[];
  ungroupedTasks: OrchestrationTaskWithDeps[];
} {
  const taskMap = new Map<string, OrchestrationTaskWithDeps>();
  const childrenByParent = new Map<string, OrchestrationTaskWithDeps[]>();
  const potentialHeads: OrchestrationTaskWithDeps[] = [];
  const orphans: OrchestrationTaskWithDeps[] = [];

  // First pass: index all tasks and identify relationships
  for (const task of tasks) {
    taskMap.set(task._id, task);

    if (task.parentTaskId) {
      const parentId = task.parentTaskId;
      const existing = childrenByParent.get(parentId) ?? [];
      existing.push(task);
      childrenByParent.set(parentId, existing);
    } else {
      // No parentTaskId - potential head agent
      potentialHeads.push(task);
    }
  }

  // Second pass: build session groups
  const sessions: SessionGroup[] = [];
  const usedTaskIds = new Set<string>();

  for (const head of potentialHeads) {
    const children = childrenByParent.get(head._id) ?? [];
    // Only create a session group if there are children or if explicitly marked as head
    const isExplicitHead = Boolean(
      (head.metadata as { isOrchestrationHead?: boolean } | undefined)?.isOrchestrationHead ||
      (head.metadata as { isCloudWorkspace?: boolean } | undefined)?.isCloudWorkspace
    );

    if (children.length > 0 || isExplicitHead) {
      sessions.push({
        headTask: head,
        childTasks: children.sort((a, b) => a.createdAt - b.createdAt),
      });
      usedTaskIds.add(head._id);
      for (const child of children) {
        usedTaskIds.add(child._id);
      }
    }
  }

  // Collect orphans (tasks with parentTaskId that doesn't exist, or standalone tasks)
  for (const task of tasks) {
    if (!usedTaskIds.has(task._id)) {
      if (task.parentTaskId && !taskMap.has(task.parentTaskId)) {
        // Parent doesn't exist in current set - orphan
        orphans.push(task);
      } else if (!task.parentTaskId) {
        // Standalone task without children
        orphans.push(task);
      }
    }
  }

  // Sort sessions by most recent activity (newest first)
  sessions.sort((a, b) => {
    const aTime = a.headTask.startedAt ?? a.headTask.createdAt;
    const bTime = b.headTask.startedAt ?? b.headTask.createdAt;
    return bTime - aTime;
  });

  return { sessions, ungroupedTasks: orphans };
}

export function OrchestrationTaskList({
  teamSlugOrId,
  tasks,
  loading,
}: OrchestrationTaskListProps) {
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");

  const { sessions, ungroupedTasks } = useMemo(() => {
    if (!tasks || tasks.length === 0) {
      return { sessions: [], ungroupedTasks: [] };
    }
    return groupTasksBySession(tasks);
  }, [tasks]);

  // Determine if we have any sessions worth grouping
  const hasSessionGroups = sessions.length > 0;

  if (loading) {
    return (
      <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 rounded bg-neutral-200 dark:bg-neutral-700" />
              <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
            </div>
            <div className="mt-2 h-4 w-full rounded bg-neutral-200 dark:bg-neutral-700" />
            <div className="mt-2 h-3 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
          </div>
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-neutral-500 dark:text-neutral-400">
        <Users className="size-8 text-neutral-400 dark:text-neutral-500" />
        <div className="text-sm font-medium text-neutral-600 dark:text-neutral-200">
          No orchestration tasks
        </div>
        <p className="text-xs">
          Spawn an agent or use the CLI to create tasks
        </p>
      </div>
    );
  }

  // If no session groups, just show flat list
  if (!hasSessionGroups || viewMode === "flat") {
    return (
      <div>
        {/* View mode toggle (only show if there are potential sessions) */}
        {hasSessionGroups && (
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        )}
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {tasks.map((task) => (
            <OrchestrationTaskRow
              key={task._id}
              task={task}
              teamSlugOrId={teamSlugOrId}
            />
          ))}
        </div>
      </div>
    );
  }

  // Show grouped view
  return (
    <div>
      {/* View mode toggle */}
      <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />

      {/* Session groups */}
      {sessions.map((session) => (
        <OrchestrationSessionGroup
          key={session.headTask._id}
          headTask={session.headTask}
          childTasks={session.childTasks}
          teamSlugOrId={teamSlugOrId}
        />
      ))}

      {/* Ungrouped tasks */}
      {ungroupedTasks.length > 0 && (
        <div className="border-t border-neutral-200 dark:border-neutral-700">
          <div className="bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            Standalone Tasks ({ungroupedTasks.length})
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {ungroupedTasks.map((task) => (
              <OrchestrationTaskRow
                key={task._id}
                task={task}
                teamSlugOrId={teamSlugOrId}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
