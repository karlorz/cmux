import { api } from "@cmux/convex/api";
import type { Doc, Id } from "@cmux/convex/dataModel";
import { useLocalStorage } from "@mantine/hooks";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import clsx from "clsx";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Pin, X, Keyboard } from "lucide-react";

// Custom hook for infinite scroll that only triggers after user has scrolled
function useInfiniteScroll(
  triggerRef: React.RefObject<HTMLElement | null>,
  onLoadMore: () => void,
  canLoadMore: boolean,
  enabled: boolean
) {
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    if (!enabled || !canLoadMore) return;

    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const findScrollParent = (element: HTMLElement | null): HTMLElement | null => {
      let current: HTMLElement | null = element;
      while (current) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const hasOverflowStyle =
          overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
        // Must have overflow style AND actually be scrollable (content exceeds viewport)
        if (hasOverflowStyle && current.scrollHeight > current.clientHeight) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    };

    // FloatingPane (and other routes) use an internal overflow container, not window scroll.
    // If we only listen to window scroll, this will never fire and we'll stay stuck on page 1.
    const scrollParent = findScrollParent(trigger.parentElement);

    const handleScroll = () => {
      hasScrolledRef.current = true;
    };

    if (scrollParent) {
      scrollParent.addEventListener("scroll", handleScroll, { passive: true });
    } else {
      window.addEventListener("scroll", handleScroll, { passive: true });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Only trigger if user has scrolled at least once
        if (entries[0].isIntersecting && hasScrolledRef.current) {
          onLoadMore();
        }
      },
      { threshold: 0.1, root: scrollParent ?? null }
    );

    observer.observe(trigger);

    return () => {
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", handleScroll);
      } else {
        window.removeEventListener("scroll", handleScroll);
      }
      observer.unobserve(trigger);
    };
  }, [triggerRef, onLoadMore, canLoadMore, enabled]);
}
import { TaskItem } from "./TaskItem";
import { PreviewItem } from "./PreviewItem";
import { ChevronRight, Loader2 } from "lucide-react";
import { useArchiveTask } from "@/hooks/useArchiveTask";
import { env } from "../../client-env";

type TaskCategoryKey =
  | "pinned"
  | "workspaces"
  | "ready_to_review"
  | "in_progress"
  | "merged";

const CATEGORY_ORDER: TaskCategoryKey[] = [
  "pinned",
  "workspaces",
  "ready_to_review",
  "in_progress",
  "merged",
];

const CATEGORY_META: Record<
  TaskCategoryKey,
  { title: string; emptyLabel: string }
> = {
  pinned: {
    title: "Pinned",
    emptyLabel: "No pinned items.",
  },
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
  pinned: [],
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
  pinned: defaultValue,
  workspaces: defaultValue,
  ready_to_review: defaultValue,
  in_progress: defaultValue,
  merged: defaultValue,
});

// Preview run types
type PreviewRunWithConfig = Doc<"previewRuns"> & {
  configRepoFullName?: string;
  taskId?: Id<"tasks">;
};

type PreviewCategoryKey = "in_progress" | "completed";

const PREVIEW_CATEGORY_ORDER: PreviewCategoryKey[] = ["in_progress", "completed"];

const PREVIEW_CATEGORY_META: Record<
  PreviewCategoryKey,
  { title: string; emptyLabel: string }
> = {
  in_progress: {
    title: "In Progress",
    emptyLabel: "No previews are currently in progress.",
  },
  completed: {
    title: "Completed",
    emptyLabel: "No completed previews yet.",
  },
};

const createEmptyPreviewCategoryBuckets = (): Record<
  PreviewCategoryKey,
  PreviewRunWithConfig[]
> => ({
  in_progress: [],
  completed: [],
});

const getPreviewCategory = (run: PreviewRunWithConfig): PreviewCategoryKey | null => {
  if (run.status === "pending" || run.status === "running") {
    return "in_progress";
  }
  // Only "completed" and "skipped" should show as completed (green circles)
  if (run.status === "completed" || run.status === "skipped") {
    return "completed";
  }
  // "failed" runs are excluded from both categories
  return null;
};

const categorizePreviewRuns = (
  runs: PreviewRunWithConfig[] | undefined
): Record<PreviewCategoryKey, PreviewRunWithConfig[]> | null => {
  if (!runs) {
    return null;
  }
  const buckets = createEmptyPreviewCategoryBuckets();
  for (const run of runs) {
    const key = getPreviewCategory(run);
    // Skip runs that don't belong to any category (e.g., failed runs)
    if (key !== null) {
      buckets[key].push(run);
    }
  }
  return buckets;
};

const createCollapsedPreviewCategoryState = (
  defaultValue = false
): Record<PreviewCategoryKey, boolean> => ({
  in_progress: defaultValue,
  completed: defaultValue,
});

const PREVIEW_PAGE_SIZE = 20;
const TASKS_PAGE_SIZE = 10;
const CATEGORY_INITIAL_DISPLAY_COUNT = 5;

export const TaskList = memo(function TaskList({
  teamSlugOrId,
}: {
  teamSlugOrId: string;
}) {
  // In web mode, exclude local workspaces from the task list
  const excludeLocalWorkspaces = env.NEXT_PUBLIC_WEB_MODE || undefined;

  // Selection state for bulk actions
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const hasSelection = selectedTaskIds.size > 0;

  // Keyboard navigation state
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  // Bulk action mutations
  const pinTask = useMutation(api.tasks.pin);
  const unpinTask = useMutation(api.tasks.unpin);
  const { archiveWithUndo } = useArchiveTask(teamSlugOrId);

  const handleSelectionChange = useCallback((taskId: string, selected: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
  }, []);

  // Paginated query for main tasks (replaces non-paginated api.tasks.get)
  const {
    results: allTasks,
    status: allTasksStatus,
    loadMore: loadMoreTasks,
  } = usePaginatedQuery(
    api.tasks.getPaginated,
    { teamSlugOrId, excludeLocalWorkspaces },
    { initialNumItems: TASKS_PAGE_SIZE },
  );
  const pinnedData = useQuery(api.tasks.getPinned, { teamSlugOrId, excludeLocalWorkspaces });
  const {
    results: previewRuns,
    status: previewRunsStatus,
    loadMore: loadMorePreviewRuns,
  } = usePaginatedQuery(
    api.previewRuns.listByTeamPaginated,
    { teamSlugOrId },
    { initialNumItems: PREVIEW_PAGE_SIZE },
  );
  const [tab, setTab] = useState<"all" | "previews">("all");

  // Bulk actions
  const handleBulkPin = useCallback(async () => {
    const promises = Array.from(selectedTaskIds).map(id =>
      pinTask({ teamSlugOrId, id: id as Id<"tasks"> })
    );
    await Promise.all(promises);
    clearSelection();
  }, [selectedTaskIds, pinTask, teamSlugOrId, clearSelection]);

  const handleBulkUnpin = useCallback(async () => {
    const promises = Array.from(selectedTaskIds).map(id =>
      unpinTask({ teamSlugOrId, id: id as Id<"tasks"> })
    );
    await Promise.all(promises);
    clearSelection();
  }, [selectedTaskIds, unpinTask, teamSlugOrId, clearSelection]);

  const handleBulkArchive = useCallback(async () => {
    // Get selected tasks from allTasks
    const selectedTasks = allTasks.filter(t => selectedTaskIds.has(t._id));
    for (const task of selectedTasks) {
      archiveWithUndo(task);
    }
    clearSelection();
  }, [selectedTaskIds, allTasks, archiveWithUndo, clearSelection]);

  // Infinite scroll for preview runs
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const previewLoadMoreTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab !== "previews" || previewRunsStatus !== "CanLoadMore") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMorePreviewRuns(PREVIEW_PAGE_SIZE);
        }
      },
      { threshold: 0.1 },
    );

    const trigger = previewLoadMoreTriggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }

    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [tab, previewRunsStatus, loadMorePreviewRuns]);

  // Infinite scroll for all tasks - only triggers after user has scrolled
  const tasksLoadMoreTriggerRef = useRef<HTMLDivElement>(null);
  useInfiniteScroll(
    tasksLoadMoreTriggerRef,
    () => loadMoreTasks(TASKS_PAGE_SIZE),
    allTasksStatus === "CanLoadMore",
    tab === "all"
  );

  const categorizedTasks = useMemo(() => {
    // allTasks is always defined with usePaginatedQuery (empty array during loading)
    const categorized = categorizeTasks(allTasks.length > 0 ? allTasks : undefined);
    if (categorized && pinnedData) {
      // Filter pinned tasks out from other categories
      const pinnedTaskIds = new Set(pinnedData.map(t => t._id));

      for (const key of CATEGORY_ORDER) {
        if (key !== 'pinned') {
          categorized[key] = categorized[key].filter(t => !pinnedTaskIds.has(t._id));
        }
      }

      // Add pinned tasks to the pinned category (already sorted by the API)
      categorized.pinned = pinnedData;
    }
    return categorized;
  }, [allTasks, pinnedData]);
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

  // Expanded state for "show more/show less" per category
  const expandedStorageKey = useMemo(
    () => `dashboard-expanded-categories-${teamSlugOrId}`,
    [teamSlugOrId]
  );
  const defaultExpandedState = useMemo(
    () => createCollapsedCategoryState(false), // reuse helper, all false = not expanded
    []
  );
  const [expandedCategories, setExpandedCategories] = useLocalStorage<
    Record<TaskCategoryKey, boolean>
  >({
    key: expandedStorageKey,
    defaultValue: defaultExpandedState,
    getInitialValueInEffect: true,
  });

  const toggleCategoryExpanded = useCallback((categoryKey: TaskCategoryKey) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }));
  }, [setExpandedCategories]);

  // Preview runs categorization
  const categorizedPreviewRuns = useMemo(
    () => categorizePreviewRuns(previewRuns),
    [previewRuns]
  );
  const previewCategoryBuckets = categorizedPreviewRuns ?? createEmptyPreviewCategoryBuckets();

  const collapsedPreviewStorageKey = useMemo(
    () => `dashboard-collapsed-preview-categories-${teamSlugOrId}`,
    [teamSlugOrId]
  );
  const defaultCollapsedPreviewState = useMemo(
    () => createCollapsedPreviewCategoryState(),
    []
  );
  const [collapsedPreviewCategories, setCollapsedPreviewCategories] = useLocalStorage<
    Record<PreviewCategoryKey, boolean>
  >({
    key: collapsedPreviewStorageKey,
    defaultValue: defaultCollapsedPreviewState,
    getInitialValueInEffect: true,
  });

  const togglePreviewCategoryCollapse = useCallback((categoryKey: PreviewCategoryKey) => {
    setCollapsedPreviewCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }));
  }, [setCollapsedPreviewCategories]);

  // Expanded state for "show more/show less" per preview category
  const expandedPreviewStorageKey = useMemo(
    () => `dashboard-expanded-preview-categories-${teamSlugOrId}`,
    [teamSlugOrId]
  );
  const defaultExpandedPreviewState = useMemo(
    () => createCollapsedPreviewCategoryState(false),
    []
  );
  const [expandedPreviewCategories, setExpandedPreviewCategories] = useLocalStorage<
    Record<PreviewCategoryKey, boolean>
  >({
    key: expandedPreviewStorageKey,
    defaultValue: defaultExpandedPreviewState,
    getInitialValueInEffect: true,
  });

  const togglePreviewCategoryExpanded = useCallback((categoryKey: PreviewCategoryKey) => {
    setExpandedPreviewCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }));
  }, [setExpandedPreviewCategories]);

  // Flatten visible tasks for keyboard navigation (respects collapsed/expanded state)
  const flattenedTaskIds = useMemo(() => {
    const ids: string[] = [];
    for (const categoryKey of CATEGORY_ORDER) {
      // Skip collapsed categories
      if (collapsedCategories[categoryKey]) continue;
      // Skip empty pinned category
      if (categoryKey === 'pinned' && categoryBuckets[categoryKey].length === 0) continue;

      const tasks = categoryBuckets[categoryKey];
      const hasOverflow = tasks.length > CATEGORY_INITIAL_DISPLAY_COUNT;
      const visibleTasks = hasOverflow && !expandedCategories[categoryKey]
        ? tasks.slice(0, CATEGORY_INITIAL_DISPLAY_COUNT)
        : tasks;

      for (const task of visibleTasks) {
        ids.push(task._id);
      }
    }
    return ids;
  }, [categoryBuckets, collapsedCategories, expandedCategories]);

  // Keyboard shortcuts for task navigation
  const [showKeyboardHint, setShowKeyboardHint] = useState(false);

  useEffect(() => {
    if (tab !== "all") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const currentIndex = focusedTaskId ? flattenedTaskIds.indexOf(focusedTaskId) : -1;

      switch (e.key) {
        case "j": // Move down
          e.preventDefault();
          if (flattenedTaskIds.length > 0) {
            const nextIndex = currentIndex < flattenedTaskIds.length - 1 ? currentIndex + 1 : 0;
            setFocusedTaskId(flattenedTaskIds[nextIndex]);
          }
          break;
        case "k": // Move up
          e.preventDefault();
          if (flattenedTaskIds.length > 0) {
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : flattenedTaskIds.length - 1;
            setFocusedTaskId(flattenedTaskIds[prevIndex]);
          }
          break;
        case "x": // Toggle selection
          e.preventDefault();
          if (focusedTaskId) {
            const isCurrentlySelected = selectedTaskIds.has(focusedTaskId);
            handleSelectionChange(focusedTaskId, !isCurrentlySelected);
          }
          break;
        case "Escape": // Clear selection and focus
          e.preventDefault();
          clearSelection();
          setFocusedTaskId(null);
          break;
        case "?": // Show keyboard shortcuts hint
          e.preventDefault();
          setShowKeyboardHint((prev) => !prev);
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [tab, focusedTaskId, flattenedTaskIds, selectedTaskIds, handleSelectionChange, clearSelection]);

  // Scroll focused task into view
  useEffect(() => {
    if (focusedTaskId) {
      const element = document.querySelector(`[data-task-id="${focusedTaskId}"]`);
      element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedTaskId]);

  return (
    <div className="mt-6 w-full">
      <div className="mb-3 px-4">
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
              (tab === "previews"
                ? "text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200")
            }
            onMouseDown={() => setTab("previews")}
            onClick={() => setTab("previews")}
          >
            Previews
          </button>
        </div>
      </div>

      {/* Bulk actions toolbar */}
      {hasSelection && tab === "all" && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-md bg-neutral-100 dark:bg-neutral-800 px-3 py-2">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            {selectedTaskIds.size} selected
          </span>
          <div className="flex-1" />
          <button
            onClick={handleBulkPin}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Pin className="h-3 w-3" />
            Pin
          </button>
          <button
            onClick={handleBulkUnpin}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Pin className="h-3 w-3" />
            Unpin
          </button>
          <button
            onClick={handleBulkArchive}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Archive className="h-3 w-3" />
            Archive
          </button>
          <button
            onClick={clearSelection}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-700"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      {showKeyboardHint && tab === "all" && (
        <div className="mx-4 mb-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-3 py-2">
          <div className="flex items-center gap-2 mb-2">
            <Keyboard className="h-3.5 w-3.5 text-neutral-500" />
            <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Keyboard Shortcuts</span>
            <button
              onClick={() => setShowKeyboardHint(false)}
              className="ml-auto p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono">j</kbd>
              <span className="text-neutral-600 dark:text-neutral-400">Move down</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono">k</kbd>
              <span className="text-neutral-600 dark:text-neutral-400">Move up</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono">x</kbd>
              <span className="text-neutral-600 dark:text-neutral-400">Toggle select</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono">Esc</kbd>
              <span className="text-neutral-600 dark:text-neutral-400">Clear selection</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono">?</kbd>
              <span className="text-neutral-600 dark:text-neutral-400">Toggle this help</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1 w-full">
        {tab === "previews" ? (
          previewRunsStatus === "LoadingFirstPage" ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 pl-4 select-none">
              Loading...
            </div>
          ) : previewRuns.length === 0 ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 pl-4 select-none">
              No preview runs
            </div>
          ) : (
            <div ref={previewScrollRef} className="flex flex-col w-full">
              <div className="mt-1 w-full flex flex-col space-y-[-1px] transform -translate-y-px">
                {PREVIEW_CATEGORY_ORDER.map((categoryKey) => (
                  <PreviewCategorySection
                    key={categoryKey}
                    categoryKey={categoryKey}
                    previewRuns={previewCategoryBuckets[categoryKey]}
                    teamSlugOrId={teamSlugOrId}
                    collapsed={Boolean(collapsedPreviewCategories[categoryKey])}
                    onToggle={togglePreviewCategoryCollapse}
                    expanded={Boolean(expandedPreviewCategories[categoryKey])}
                    onToggleExpanded={togglePreviewCategoryExpanded}
                    initialDisplayCount={CATEGORY_INITIAL_DISPLAY_COUNT}
                  />
                ))}
              </div>
              {/* Infinite scroll trigger */}
              <div ref={previewLoadMoreTriggerRef} className="w-full py-2">
                {previewRunsStatus === "LoadingMore" && (
                  <div className="flex items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading more...</span>
                  </div>
                )}
                {previewRunsStatus === "CanLoadMore" && (
                  <div className="h-1" />
                )}
              </div>
            </div>
          )
        ) : allTasksStatus === "LoadingFirstPage" ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 pl-4 select-none">
            Loading...
          </div>
        ) : (
          <div className="flex flex-col w-full">
            <div className="mt-1 w-full flex flex-col space-y-[-1px] transform -translate-y-px">
              {CATEGORY_ORDER.map((categoryKey) => {
                // Don't render the pinned category if it's empty
                if (categoryKey === 'pinned' && categoryBuckets[categoryKey].length === 0) {
                  return null;
                }
                return (
                  <TaskCategorySection
                    key={categoryKey}
                    categoryKey={categoryKey}
                    tasks={categoryBuckets[categoryKey]}
                    teamSlugOrId={teamSlugOrId}
                    collapsed={Boolean(collapsedCategories[categoryKey])}
                    onToggle={toggleCategoryCollapse}
                    expanded={Boolean(expandedCategories[categoryKey])}
                    onToggleExpanded={toggleCategoryExpanded}
                    initialDisplayCount={CATEGORY_INITIAL_DISPLAY_COUNT}
                    selectedTaskIds={selectedTaskIds}
                    onSelectionChange={handleSelectionChange}
                    focusedTaskId={focusedTaskId}
                  />
                );
              })}
            </div>
            {/* Infinite scroll trigger - only fires after user has scrolled */}
            <div ref={tasksLoadMoreTriggerRef} className="w-full py-2">
              {allTasksStatus === "LoadingMore" && (
                <div className="flex items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading more...</span>
                </div>
              )}
              {allTasksStatus === "CanLoadMore" && (
                <div className="h-1" />
              )}
            </div>
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
  expanded,
  onToggleExpanded,
  initialDisplayCount,
  selectedTaskIds,
  onSelectionChange,
  focusedTaskId,
}: {
  categoryKey: TaskCategoryKey;
  tasks: Doc<"tasks">[];
  teamSlugOrId: string;
  collapsed: boolean;
  onToggle: (key: TaskCategoryKey) => void;
  expanded: boolean;
  onToggleExpanded: (key: TaskCategoryKey) => void;
  initialDisplayCount: number;
  selectedTaskIds: Set<string>;
  onSelectionChange: (taskId: string, selected: boolean) => void;
  focusedTaskId: string | null;
}) {
  const meta = CATEGORY_META[categoryKey];
  const handleToggle = useCallback(
    () => onToggle(categoryKey),
    [categoryKey, onToggle]
  );
  const handleToggleExpanded = useCallback(
    () => onToggleExpanded(categoryKey),
    [categoryKey, onToggleExpanded]
  );
  const contentId = `task-category-${categoryKey}`;
  const toggleLabel = collapsed
    ? `Expand ${meta.title}`
    : `Collapse ${meta.title}`;

  // Show more/show less logic
  const hasOverflow = tasks.length > initialDisplayCount;
  const visibleTasks = hasOverflow && !expanded ? tasks.slice(0, initialDisplayCount) : tasks;
  const remainingCount = Math.max(0, tasks.length - visibleTasks.length);

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
          {visibleTasks.map((task) => (
            <TaskItem
              key={task._id}
              task={task}
              teamSlugOrId={teamSlugOrId}
              isSelected={selectedTaskIds.has(task._id)}
              onSelectionChange={onSelectionChange}
              showCheckbox={selectedTaskIds.size > 0}
              isFocused={focusedTaskId === task._id}
            />
          ))}
          {hasOverflow && (
            <button
              type="button"
              onClick={handleToggleExpanded}
              className="w-full px-4 py-1.5 text-left text-[11px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              {expanded ? "Show less" : `Show more (${remainingCount})`}
            </button>
          )}
        </div>
      ) : (
        <div className="flex w-full items-center px-4 py-3">
          <p className="pl-5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
            {meta.emptyLabel}
          </p>
        </div>
      )}
    </div>
  );
}

function PreviewCategorySection({
  categoryKey,
  previewRuns,
  teamSlugOrId,
  collapsed,
  onToggle,
  expanded,
  onToggleExpanded,
  initialDisplayCount,
}: {
  categoryKey: PreviewCategoryKey;
  previewRuns: PreviewRunWithConfig[];
  teamSlugOrId: string;
  collapsed: boolean;
  onToggle: (key: PreviewCategoryKey) => void;
  expanded: boolean;
  onToggleExpanded: (key: PreviewCategoryKey) => void;
  initialDisplayCount: number;
}) {
  const meta = PREVIEW_CATEGORY_META[categoryKey];
  const handleToggle = useCallback(
    () => onToggle(categoryKey),
    [categoryKey, onToggle]
  );
  const handleToggleExpanded = useCallback(
    () => onToggleExpanded(categoryKey),
    [categoryKey, onToggleExpanded]
  );
  const contentId = `preview-category-${categoryKey}`;
  const toggleLabel = collapsed
    ? `Expand ${meta.title}`
    : `Collapse ${meta.title}`;

  // Show more/show less logic
  const hasOverflow = previewRuns.length > initialDisplayCount;
  const visibleRuns = hasOverflow && !expanded ? previewRuns.slice(0, initialDisplayCount) : previewRuns;
  const remainingCount = Math.max(0, previewRuns.length - visibleRuns.length);

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
              {previewRuns.length}
            </span>
          </div>
        </div>
      </div>
      {collapsed ? null : previewRuns.length > 0 ? (
        <div id={contentId} className="flex flex-col w-full">
          {visibleRuns.map((run) => (
            <PreviewItem key={run._id} previewRun={run} teamSlugOrId={teamSlugOrId} />
          ))}
          {hasOverflow && (
            <button
              type="button"
              onClick={handleToggleExpanded}
              className="w-full px-4 py-1.5 text-left text-[11px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              {expanded ? "Show less" : `Show more (${remainingCount})`}
            </button>
          )}
        </div>
      ) : (
        <div className="flex w-full items-center px-4 py-3">
          <p className="pl-5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
            {meta.emptyLabel}
          </p>
        </div>
      )}
    </div>
  );
}
