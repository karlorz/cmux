import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { useQuery } from "convex/react";
import { memo, useMemo, useState } from "react";
import { TaskItem } from "./TaskItem";

type TaskDoc = Doc<"tasks">;

const READY_TO_REVIEW_STATUSES: ReadonlySet<TaskDoc["mergeStatus"]> = new Set([
  "pr_open",
  "pr_approved",
  "pr_changes_requested",
]);

type TaskSectionKey = "ready" | "working" | "merged" | "closed";

const TASK_SECTIONS: Array<{ key: TaskSectionKey; label: string }> = [
  { key: "ready", label: "Ready to review" },
  { key: "working", label: "Working" },
  { key: "merged", label: "Merged" },
  { key: "closed", label: "Closed" },
];

type TaskSections = Record<TaskSectionKey, TaskDoc[]>;

export const TaskList = memo(function TaskList({
  teamSlugOrId,
}: {
  teamSlugOrId: string;
}) {
  const allTasks = useQuery(api.tasks.get, { teamSlugOrId });
  const archivedTasks = useQuery(api.tasks.get, {
    teamSlugOrId,
    archived: true,
  });
  const [tab, setTab] = useState<"all" | "archived">("all");
  const tasks = tab === "archived" ? archivedTasks : allTasks;

  const sections = useMemo<TaskSections | null>(() => {
    if (!tasks) {
      return null;
    }

    const base: TaskSections = {
      ready: [],
      working: [],
      merged: [],
      closed: [],
    };

    for (const task of tasks) {
      const status = task.mergeStatus;
      if (status === "pr_merged") {
        base.merged.push(task);
        continue;
      }
      if (status === "pr_closed") {
        base.closed.push(task);
        continue;
      }
      if (status && READY_TO_REVIEW_STATUSES.has(status)) {
        base.ready.push(task);
        continue;
      }

      base.working.push(task);
    }

    return base;
  }, [tasks]);

  return (
    <div className="mt-6">
      <div className="mb-3">
        <div className="flex items-end gap-2.5 select-none">
          <button
            className={
              "text-sm font-medium transition-colors " +
              (tab === "all"
                ? "text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200")
            }
            onMouseDown={() => setTab("all")}
            onClick={() => setTab("all")}
          >
            Tasks
          </button>
          <button
            className={
              "text-sm font-medium transition-colors " +
              (tab === "archived"
                ? "text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200")
            }
            onMouseDown={() => setTab("archived")}
            onClick={() => setTab("archived")}
          >
            Archived
          </button>
        </div>
      </div>
      {tasks === undefined || sections === null ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 select-none">
          Loading...
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {TASK_SECTIONS.map(({ key, label }) => (
            <TaskSection
              key={key}
              label={label}
              tasks={sections[key]}
              teamSlugOrId={teamSlugOrId}
              emptyMessage={
                tab === "all"
                  ? `No ${label.toLowerCase()} tasks`
                  : `No archived tasks`
              }
            />
          ))}
        </div>
      )}
    </div>
  );
});

function TaskSection({
  label,
  tasks,
  teamSlugOrId,
  emptyMessage,
}: {
  label: string;
  tasks: TaskDoc[];
  teamSlugOrId: string;
  emptyMessage: string;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 select-none">
        {label}
      </div>
      {tasks.length === 0 ? (
        <div className="text-sm text-neutral-400 dark:text-neutral-500 py-1 select-none">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {tasks.map((task) => (
            <TaskItem key={task._id} task={task} teamSlugOrId={teamSlugOrId} />
          ))}
        </div>
      )}
    </section>
  );
}
