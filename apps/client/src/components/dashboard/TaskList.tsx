import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import { memo, useState } from "react";
import { TaskItem } from "./TaskItem";

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
      <div className="flex flex-col gap-1">
        {Array.isArray(tasks) && tasks.length > 0 && (
          <div className="px-3 pt-1 pb-0.5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              <span aria-hidden="true" />
              <span>Task</span>
              <span>Crown</span>
              <span className="justify-self-end">Updated</span>
            </div>
          </div>
        )}
        {tasks === undefined ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 select-none">
            Loading...
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 select-none">
            {tab === "all" ? "No active tasks" : "No archived tasks"}
          </div>
        ) : (
          tasks.map((task) => (
            <TaskItem key={task._id} task={task} teamSlugOrId={teamSlugOrId} />
          ))
        )}
      </div>
    </div>
  );
});
