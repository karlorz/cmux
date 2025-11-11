import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { useLocalStorage } from "@mantine/hooks";
import { useQuery } from "convex/react";
import clsx from "clsx";
import { memo, useCallback, useMemo, useState, type RefObject } from "react";
import { TaskItem } from "./TaskItem";
import { ChevronRight, Search, X } from "lucide-react";

type TaskCategoryKey =
  | "workspaces"
  | "ready_to_review"
  | "in_progress"
  | "merged";

const CATEGORY_ORDER: TaskCategoryKey[] = [
  "workspaces",
  "ready_to_review",
  "in_progress",
  "merged",
];

const CATEGORY_META: Record<
  TaskCategoryKey,
  { title: string; emptyLabel: string }
> = {
  workspaces: {
    title: "Workspaces",
    emptyLabel: "No workspace sessions yet.",
  },
  ready_to_review: {
    title: "Ready to review",
    emptyLabel: "Nothing is waiting for review.",
  },
  in_progress: {
    title: "In progress",
    emptyLabel: "No tasks are currently in progress.",
  },
  merged: {
    title: "Merged",
    emptyLabel: "No merged tasks yet.",
  },
};

const createEmptyCategoryBuckets = (): Record<
  TaskCategoryKey,
  Doc<"tasks">[]
> => ({
  workspaces: [],
  ready_to_review: [],
  in_progress: [],
  merged: [],
});

const getTaskCategory = (task: Doc<"tasks">): TaskCategoryKey => {
  if (task.isCloudWorkspace || task.isLocalWorkspace) {
    return "workspaces";
  }
  if (task.mergeStatus === "pr_merged") {
    return "merged";
  }
  if (task.crownEvaluationStatus === "succeeded") {
    return "ready_to_review";
  }
  return "in_progress";
};

const sortByRecentUpdate = (tasks: Doc<"tasks">[]): Doc<"tasks">[] => {
  if (tasks.length <= 1) {
    return tasks;
  }
  return [...tasks].sort(
    (a, b) =>
      (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0)
  );
};

const categorizeTasks = (
  tasks: Doc<"tasks">[] | undefined
): Record<TaskCategoryKey, Doc<"tasks">[]> | null => {
  if (!tasks) {
    return null;
  }
  const buckets = createEmptyCategoryBuckets();
  for (const task of tasks) {
    const key = getTaskCategory(task);
    buckets[key].push(task);
  }
  for (const key of CATEGORY_ORDER) {
    buckets[key] = sortByRecentUpdate(buckets[key]);
  }
  return buckets;
};

const createCollapsedCategoryState = (
  defaultValue = false
): Record<TaskCategoryKey, boolean> => ({
  workspaces: defaultValue,
  ready_to_review: defaultValue,
  in_progress: defaultValue,
  merged: defaultValue,
});

export const TaskList = memo(function TaskList({
  teamSlugOrId,
  searchQuery = "",
  searchInputRef,
  isSearchFocused,
  setIsSearchFocused,
  setSearchQuery,
}: {
  teamSlugOrId: string;
  searchQuery?: string;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  isSearchFocused?: boolean;
  setIsSearchFocused?: (focused: boolean) => void;
  setSearchQuery?: (query: string) => void;
}) {
  const allTasks = useQuery(api.tasks.get, { teamSlugOrId });
  const archivedTasks = useQuery(api.tasks.get, {
    teamSlugOrId,
    archived: true,
  });
  const [tab, setTab] = useState<"all" | "archived">("all");

  // Filter tasks based on search query
  const filterTasks = useCallback((tasks: Doc<"tasks">[] | undefined): Doc<"tasks">[] | undefined => {
    if (!tasks) return undefined;
    if (!searchQuery || searchQuery.trim() === "") return tasks;

    const query = searchQuery.toLowerCase().trim();
    return tasks.filter((task) => {
      // Search in task text/description
      if (task.text?.toLowerCase().includes(query)) return true;
      if (task.description?.toLowerCase().includes(query)) return true;

      // Search in project name
      if (task.projectFullName?.toLowerCase().includes(query)) return true;

      // Search in branch name
      if (task.baseBranch?.toLowerCase().includes(query)) return true;

      // Search in environment name (would need to join with environments table for full name)
      // For now, just check environment ID
      if (task.environmentId?.toLowerCase().includes(query)) return true;

      return false;
    });
  }, [searchQuery]);

  const filteredAllTasks = useMemo(() => filterTasks(allTasks), [allTasks, filterTasks]);
  const filteredArchivedTasks = useMemo(() => filterTasks(archivedTasks), [archivedTasks, filterTasks]);

  const categorizedTasks = useMemo(() => categorizeTasks(filteredAllTasks), [filteredAllTasks]);
  const categoryBuckets = categorizedTasks ?? createEmptyCategoryBuckets();
  const collapsedStorageKey = useMemo(
    () => `dashboard-collapsed-categories-${teamSlugOrId}`,
    [teamSlugOrId]
  );
  const defaultCollapsedState = useMemo(
    () => createCollapsedCategoryState(),
    []
  );
  const [collapsedCategories, setCollapsedCategories] = useLocalStorage<
    Record<TaskCategoryKey, boolean>
  >({
    key: collapsedStorageKey,
    defaultValue: defaultCollapsedState,
    getInitialValueInEffect: true,
  });

  const toggleCategoryCollapse = useCallback((categoryKey: TaskCategoryKey) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }));
  }, [setCollapsedCategories]);

  return (
    <div className="mt-6 w-full">
      <div className="mb-3 px-4">
        <div className="flex items-center justify-between">
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

          {/* Search Input */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search tasks (⌘F)"
                value={searchQuery}
                onChange={(e) => setSearchQuery?.(e.target.value)}
                onFocus={() => setIsSearchFocused?.(true)}
                onBlur={() => setIsSearchFocused?.(false)}
                className={clsx(
                  "h-7 w-48 rounded-md border pl-8 pr-7 text-sm",
                  "bg-white dark:bg-neutral-800",
                  "border-neutral-200 dark:border-neutral-700",
                  "placeholder:text-neutral-400 dark:placeholder:text-neutral-500",
                  "focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-100",
                  "focus:border-transparent",
                  "transition-all duration-150",
                  isSearchFocused && "w-64"
                )}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery?.("");
                    searchInputRef?.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1 w-full">
        {tab === "archived" ? (
          filteredArchivedTasks === undefined ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 select-none px-4">
              Loading...
            </div>
          ) : filteredArchivedTasks.length === 0 ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 select-none px-4">
              {searchQuery ? `No archived tasks matching "${searchQuery}"` : "No archived tasks"}
            </div>
          ) : (
            filteredArchivedTasks.map((task) => (
              <TaskItem
                key={task._id}
                task={task}
                teamSlugOrId={teamSlugOrId}
              />
            ))
          )
        ) : filteredAllTasks === undefined ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 select-none px-4">
            Loading...
          </div>
        ) : filteredAllTasks.length === 0 && searchQuery ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 select-none px-4">
            No tasks matching "{searchQuery}"
          </div>
        ) : (
          <div className="mt-1 w-full flex flex-col space-y-[-1px] transform -translate-y-px">
            {CATEGORY_ORDER.map((categoryKey) => (
              <TaskCategorySection
                key={categoryKey}
                categoryKey={categoryKey}
                tasks={categoryBuckets[categoryKey]}
                teamSlugOrId={teamSlugOrId}
                collapsed={Boolean(collapsedCategories[categoryKey])}
                onToggle={toggleCategoryCollapse}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

function TaskCategorySection({
  categoryKey,
  tasks,
  teamSlugOrId,
  collapsed,
  onToggle,
  searchQuery,
}: {
  categoryKey: TaskCategoryKey;
  tasks: Doc<"tasks">[];
  teamSlugOrId: string;
  collapsed: boolean;
  onToggle: (key: TaskCategoryKey) => void;
  searchQuery?: string;
}) {
  const meta = CATEGORY_META[categoryKey];
  const handleToggle = useCallback(
    () => onToggle(categoryKey),
    [categoryKey, onToggle]
  );
  const contentId = `task-category-${categoryKey}`;
  const toggleLabel = collapsed
    ? `Expand ${meta.title}`
    : `Collapse ${meta.title}`;
  return (
    <div className="w-full">
      <div
        className="sticky top-0 z-10 flex w-full border-y border-neutral-200 dark:border-neutral-900 bg-neutral-100 dark:bg-neutral-800 select-none"
        onDoubleClick={handleToggle}
      >
        <div className="flex w-full items-center pr-4">
          <button
            type="button"
            onClick={handleToggle}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            className="flex h-9 w-9 items-center justify-center text-neutral-500 hover:text-black dark:text-neutral-400 dark:hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300 dark:focus-visible:outline-neutral-700 transition-colors"
          >
            <ChevronRight
              className={clsx(
                "h-3 w-3 transition-transform duration-200",
                !collapsed && "rotate-90"
              )}
              aria-hidden="true"
            />
          </button>
          <div className="flex items-center gap-2 text-xs font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
            <span>{meta.title}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {tasks.length}
            </span>
          </div>
        </div>
      </div>
      {collapsed ? null : tasks.length > 0 ? (
        <div id={contentId} className="flex flex-col w-full">
          {tasks.map((task) => (
            <TaskItem key={task._id} task={task} teamSlugOrId={teamSlugOrId} />
          ))}
        </div>
      ) : (
        <div className="flex w-full items-center px-4 py-3">
          <p className="pl-5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
            {searchQuery ? `No ${meta.title.toLowerCase()} matching "${searchQuery}"` : meta.emptyLabel}
          </p>
        </div>
      )}
    </div>
  );
}
