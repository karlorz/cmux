import { api } from "@cmux/convex/api";
import type { Doc, Id } from "@cmux/convex/dataModel";
import { useLocalStorage } from "@mantine/hooks";
import { usePaginatedQuery, useQuery } from "convex/react";
import clsx from "clsx";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TaskItem } from "./TaskItem";
import { PreviewItem } from "./PreviewItem";
import { ChevronRight, Loader2 } from "lucide-react";
import { env } from "../../client-env";

type TaskCategoryKey =
  | "pinned"
  | "workspaces"
  | "ready_to_review"
  | "in_progress"
  | "merged";

type PaginatedQueryStatus =
  | "LoadingFirstPage"
  | "LoadingMore"
  | "CanLoadMore"
  | "Exhausted";

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

const createCollapsedCategoryState = (
  defaultValue = false
): Record<TaskCategoryKey, boolean> => ({
  pinned: defaultValue,
  workspaces: defaultValue,
  ready_to_review: defaultValue,
  in_progress: defaultValue,
  merged: true,
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

const ARCHIVED_PAGE_SIZE = 20;
const PREVIEW_PAGE_SIZE = 20;
const WORKSPACES_PAGE_SIZE = 20;
const READY_TO_REVIEW_PAGE_SIZE = 20;
const IN_PROGRESS_PAGE_SIZE = 20;
const MERGED_PAGE_SIZE = 10;

export const TaskList = memo(function TaskList({
  teamSlugOrId,
}: {
  teamSlugOrId: string;
}) {
  // In web mode, exclude local workspaces from the task list
  const excludeLocalWorkspaces = env.NEXT_PUBLIC_WEB_MODE || undefined;

  const {
    results: workspaces,
    status: workspacesStatus,
    loadMore: loadMoreWorkspaces,
  } = usePaginatedQuery(
    api.tasks.getWorkspacesPaginated,
    { teamSlugOrId, excludeLocalWorkspaces },
    { initialNumItems: WORKSPACES_PAGE_SIZE },
  );
  const {
    results: readyToReview,
    status: readyToReviewStatus,
    loadMore: loadMoreReadyToReview,
  } = usePaginatedQuery(
    api.tasks.getReadyToReviewPaginated,
    { teamSlugOrId, excludeLocalWorkspaces },
    { initialNumItems: READY_TO_REVIEW_PAGE_SIZE },
  );
  const {
    results: inProgress,
    status: inProgressStatus,
    loadMore: loadMoreInProgress,
  } = usePaginatedQuery(
    api.tasks.getInProgressPaginated,
    { teamSlugOrId, excludeLocalWorkspaces },
    { initialNumItems: IN_PROGRESS_PAGE_SIZE },
  );
  const {
    results: merged,
    status: mergedStatus,
    loadMore: loadMoreMerged,
  } = usePaginatedQuery(
    api.tasks.getMergedPaginated,
    { teamSlugOrId, excludeLocalWorkspaces },
    { initialNumItems: MERGED_PAGE_SIZE },
  );
  const {
    results: archivedTasks,
    status: archivedStatus,
    loadMore: loadMoreArchived,
  } = usePaginatedQuery(
    api.tasks.getArchivedPaginated,
    { teamSlugOrId, excludeLocalWorkspaces },
    { initialNumItems: ARCHIVED_PAGE_SIZE },
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
  const [tab, setTab] = useState<"all" | "archived" | "previews">("all");

  // Infinite scroll for archived tasks
  const archivedScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  // Infinite scroll for preview runs
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const previewLoadMoreTriggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab !== "archived" || archivedStatus !== "CanLoadMore") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreArchived(ARCHIVED_PAGE_SIZE);
        }
      },
      { threshold: 0.1 },
    );

    const trigger = loadMoreTriggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }

    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [tab, archivedStatus, loadMoreArchived]);

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

  const isAllTasksLoading =
    pinnedData === undefined &&
    workspacesStatus === "LoadingFirstPage" &&
    readyToReviewStatus === "LoadingFirstPage" &&
    inProgressStatus === "LoadingFirstPage" &&
    mergedStatus === "LoadingFirstPage";

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
      <div className="flex flex-col gap-1 w-full">
        {tab === "archived" ? (
          archivedStatus === "LoadingFirstPage" ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 pl-4 select-none">
              Loading...
            </div>
          ) : archivedTasks.length === 0 ? (
            <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 pl-4 select-none">
              No archived tasks
            </div>
          ) : (
            <div ref={archivedScrollRef} className="flex flex-col w-full">
              {archivedTasks.map((task) => (
                <TaskItem
                  key={task._id}
                  task={task}
                  teamSlugOrId={teamSlugOrId}
                />
              ))}
              {/* Infinite scroll trigger */}
              <div ref={loadMoreTriggerRef} className="w-full py-2">
                {archivedStatus === "LoadingMore" && (
                  <div className="flex items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading more...</span>
                  </div>
                )}
                {archivedStatus === "CanLoadMore" && (
                  <div className="h-1" />
                )}
              </div>
            </div>
          )
        ) : tab === "previews" ? (
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
        ) : isAllTasksLoading ? (
          <div className="text-sm text-neutral-500 dark:text-neutral-400 py-2 pl-4 select-none">
            Loading...
          </div>
        ) : (
          <div className="mt-1 w-full flex flex-col space-y-[-1px] transform -translate-y-px">
            {CATEGORY_ORDER.map((categoryKey) => {
              // Don't render the pinned category if it's empty
              const pinnedTasks = pinnedData ?? [];
              if (categoryKey === 'pinned' && pinnedTasks.length === 0) {
                return null;
              }

              const categoryData: {
                tasks: Doc<"tasks">[];
                status: PaginatedQueryStatus;
                loadMore?: (numItems: number) => void;
                pageSize?: number;
              } = (() => {
                switch (categoryKey) {
                  case "pinned":
                    return {
                      tasks: pinnedTasks,
                      status: pinnedData === undefined ? "LoadingFirstPage" : "Exhausted",
                    };
                  case "workspaces":
                    return {
                      tasks: workspaces,
                      status: workspacesStatus,
                      loadMore: loadMoreWorkspaces,
                      pageSize: WORKSPACES_PAGE_SIZE,
                    };
                  case "ready_to_review":
                    return {
                      tasks: readyToReview,
                      status: readyToReviewStatus,
                      loadMore: loadMoreReadyToReview,
                      pageSize: READY_TO_REVIEW_PAGE_SIZE,
                    };
                  case "in_progress":
                    return {
                      tasks: inProgress,
                      status: inProgressStatus,
                      loadMore: loadMoreInProgress,
                      pageSize: IN_PROGRESS_PAGE_SIZE,
                    };
                  case "merged":
                    return {
                      tasks: merged,
                      status: mergedStatus,
                      loadMore: loadMoreMerged,
                      pageSize: MERGED_PAGE_SIZE,
                    };
                }
              })();

              return (
                <TaskCategorySection
                  key={categoryKey}
                  categoryKey={categoryKey}
                  tasks={categoryData.tasks}
                  paginationStatus={categoryData.status}
                  loadMore={categoryData.loadMore}
                  pageSize={categoryData.pageSize}
                  teamSlugOrId={teamSlugOrId}
                  collapsed={Boolean(collapsedCategories[categoryKey])}
                  onToggle={toggleCategoryCollapse}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

function TaskCategorySection({
  categoryKey,
  tasks,
  paginationStatus,
  loadMore,
  pageSize,
  teamSlugOrId,
  collapsed,
  onToggle,
}: {
  categoryKey: TaskCategoryKey;
  tasks: Doc<"tasks">[];
  paginationStatus: PaginatedQueryStatus;
  loadMore?: (numItems: number) => void;
  pageSize?: number;
  teamSlugOrId: string;
  collapsed: boolean;
  onToggle: (key: TaskCategoryKey) => void;
}) {
  const meta = CATEGORY_META[categoryKey];
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(
    () => onToggle(categoryKey),
    [categoryKey, onToggle]
  );
  const contentId = `task-category-${categoryKey}`;
  const toggleLabel = collapsed
    ? `Expand ${meta.title}`
    : `Collapse ${meta.title}`;

  const countLabel = useMemo(() => {
    if (paginationStatus === "CanLoadMore" || paginationStatus === "LoadingMore") {
      return `${tasks.length}+`;
    }
    return String(tasks.length);
  }, [paginationStatus, tasks.length]);

  useEffect(() => {
    if (collapsed) return;
    if (!loadMore) return;
    if (!pageSize) return;
    if (paginationStatus !== "CanLoadMore") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore(pageSize);
        }
      },
      { threshold: 0.1 },
    );

    const trigger = loadMoreTriggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }

    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [collapsed, loadMore, pageSize, paginationStatus]);

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
              {countLabel}
            </span>
          </div>
        </div>
      </div>
      {collapsed ? null : paginationStatus === "LoadingFirstPage" ? (
        <div className="flex w-full items-center px-4 py-3">
          <p className="pl-5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
            Loading...
          </p>
        </div>
      ) : tasks.length > 0 ? (
        <div id={contentId} className="flex flex-col w-full">
          {tasks.map((task) => (
            <TaskItem key={task._id} task={task} teamSlugOrId={teamSlugOrId} />
          ))}
          {loadMore ? (
            <div ref={loadMoreTriggerRef} className="w-full py-2">
              {paginationStatus === "LoadingMore" && (
                <div className="flex items-center justify-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading more...</span>
                </div>
              )}
              {paginationStatus === "CanLoadMore" && <div className="h-1" />}
            </div>
          ) : null}
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
}: {
  categoryKey: PreviewCategoryKey;
  previewRuns: PreviewRunWithConfig[];
  teamSlugOrId: string;
  collapsed: boolean;
  onToggle: (key: PreviewCategoryKey) => void;
}) {
  const meta = PREVIEW_CATEGORY_META[categoryKey];
  const handleToggle = useCallback(
    () => onToggle(categoryKey),
    [categoryKey, onToggle]
  );
  const contentId = `preview-category-${categoryKey}`;
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
              {previewRuns.length}
            </span>
          </div>
        </div>
      </div>
      {collapsed ? null : previewRuns.length > 0 ? (
        <div id={contentId} className="flex flex-col w-full">
          {previewRuns.map((run) => (
            <PreviewItem key={run._id} previewRun={run} teamSlugOrId={teamSlugOrId} />
          ))}
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
