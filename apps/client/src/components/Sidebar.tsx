import { env } from "@/client-env";
import { TaskTree } from "@/components/TaskTree";
import { TaskTreeSkeleton } from "@/components/TaskTreeSkeleton";
import { useExpandTasks } from "@/contexts/expand-tasks/ExpandTasksContext";
import { useWarmLocalWorkspaces } from "@/hooks/useWarmLocalWorkspaces";
import {
  disableDragPointerEvents,
  restoreDragPointerEvents,
} from "@/lib/drag-pointer-events";
import { isElectron } from "@/lib/electron";
import { type Doc } from "@cmux/convex/dataModel";
import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import type { LinkProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Bell, Home, PanelLeft, Plus, Server, Settings } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import CmuxLogoMark from "./logo/cmux-logo-mark";
import { SidebarNavLink } from "./sidebar/SidebarNavLink";
import { SidebarPullRequestSection } from "./sidebar/SidebarPullRequestSection";
import { SidebarWorkspacesSection } from "./sidebar/SidebarWorkspacesSection";
import { SidebarProjectGroup } from "./sidebar/SidebarProjectGroup";
import {
  filterRelevant,
  getGroupDisplayName,
  groupItemsByProject,
  isItemRelevant,
  sortItems,
} from "./sidebar/sidebar-utils";
import {
  SIDEBAR_WS_PREFS_KEY,
  type SortBy,
} from "./sidebar/sidebar-types";
import { useSidebarPreferences } from "./sidebar/useSidebarPreferences";

// Tasks with hasUnread indicator from the query
type TaskWithUnread = Doc<"tasks"> & { hasUnread: boolean };

interface SidebarProps {
  tasks: TaskWithUnread[] | undefined;
  teamSlugOrId: string;
  isHidden: boolean;
  onToggleSidebar: () => void;
}

interface SidebarNavItem {
  label: string;
  to: LinkProps["to"];
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  search?: LinkProps["search"];
  exact?: boolean;
}
interface SidebarNavItemWithBadge extends SidebarNavItem {
  showBadge?: boolean;
  hidden?: boolean;
  onboardingKey?: string;
}

const navItems: SidebarNavItemWithBadge[] = [
  {
    label: "Home",
    to: "/$teamSlugOrId/dashboard",
    exact: true,
    icon: Home,
  },
  {
    label: "Notifications",
    to: "/$teamSlugOrId/notifications",
    exact: true,
    icon: Bell,
    showBadge: true,
    hidden: true,
  },
  {
    label: "Environments",
    to: "/$teamSlugOrId/environments",
    search: {
      step: undefined,
      selectedRepos: undefined,
      connectionLogin: undefined,
      repoSearch: undefined,
      instanceId: undefined,
    },
    exact: true,
    icon: Server,
    onboardingKey: "environments-link",
  },
  {
    label: "Settings",
    to: "/$teamSlugOrId/settings",
    exact: true,
    icon: Settings,
    onboardingKey: "settings-link",
  },
];

export function Sidebar({ tasks, teamSlugOrId, isHidden, onToggleSidebar }: SidebarProps) {
  const DEFAULT_WIDTH = 256;
  const MIN_WIDTH = 240;
  const MAX_WIDTH = 600;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const containerLeftRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const [width, setWidth] = useState<number>(() => {
    const stored = localStorage.getItem("sidebarWidth");
    const parsed = stored ? Number.parseInt(stored, 10) : DEFAULT_WIDTH;
    if (Number.isNaN(parsed)) return DEFAULT_WIDTH;
    return Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH);
  });
  const [isResizing, setIsResizing] = useState(false);

  const { expandTaskIds } = useExpandTasks();

  // Workspace section preferences
  const wsPrefs = useSidebarPreferences(SIDEBAR_WS_PREFS_KEY);

  // Fetch pinned items (exclude local workspaces in web mode)
  const excludeLocalWorkspaces = env.NEXT_PUBLIC_WEB_MODE || undefined;
  const pinnedData = useQuery(api.tasks.getPinned, { teamSlugOrId, excludeLocalWorkspaces });

  useWarmLocalWorkspaces({
    teamSlugOrId,
    tasks,
    pinnedTasks: pinnedData,
    enabled: !env.NEXT_PUBLIC_WEB_MODE,
  });

  // Fetch unread notification count
  const unreadCount = useQuery(api.taskNotifications.getUnreadCount, {
    teamSlugOrId,
  });

  useEffect(() => {
    localStorage.setItem("sidebarWidth", String(width));
  }, [width]);

  const onMouseMove = useCallback((e: MouseEvent) => {
    // Batch width updates to once per animation frame to reduce layout thrash
    if (rafIdRef.current != null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      const containerLeft = containerLeftRef.current;
      const clientX = e.clientX;
      const newWidth = Math.min(
        Math.max(clientX - containerLeft, MIN_WIDTH),
        MAX_WIDTH
      );
      setWidth(newWidth);
    });
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.classList.remove("select-none");
    document.body.classList.remove("cmux-sidebar-resizing");
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    restoreDragPointerEvents();
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopResizing);
  }, [onMouseMove]);

  const startResizing = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.classList.add("select-none");
      document.body.classList.add("cmux-sidebar-resizing");
      // Snapshot the container's left position so we don't force layout on every move
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        containerLeftRef.current = rect.left;
      }
      disableDragPointerEvents();
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", stopResizing);
    },
    [onMouseMove, stopResizing]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [onMouseMove, stopResizing]);

  const resetWidth = useCallback(() => setWidth(DEFAULT_WIDTH), []);

  // Process tasks for grouping/filtering/sorting
  const processedTasks = useMemo(() => {
    if (!tasks) return { pinned: [], groups: new Map<string, TaskWithUnread[]>(), flat: [] };

    const { preferences } = wsPrefs;
    const pinnedTasks = pinnedData?.filter(t => !t.isArchived) ?? [];
    const pinnedIds = new Set(pinnedTasks.map(t => t._id));

    // Filter out pinned and archived tasks
    let regularTasks = tasks.filter(task => !task.pinned && !task.isArchived && !pinnedIds.has(task._id));

    // Apply show filter
    regularTasks = filterRelevant(
      regularTasks,
      preferences.showFilter,
      (task) => isItemRelevant(task._creationTime, task.hasUnread)
    );

    // Apply sort
    regularTasks = sortItems(regularTasks, preferences.sortBy, (task, sortBy: SortBy) => {
      if (sortBy === "updated") {
        return task.updatedAt ?? task._creationTime;
      }
      return task._creationTime;
    });

    // Group by project if in "by-project" mode
    if (preferences.organizeMode === "by-project") {
      const groups = groupItemsByProject(regularTasks, (task) => task.projectFullName ?? undefined);
      return { pinned: pinnedTasks, groups, flat: [] };
    }

    return { pinned: pinnedTasks, groups: new Map<string, TaskWithUnread[]>(), flat: regularTasks };
  }, [tasks, pinnedData, wsPrefs]);

  // When sidebar is hidden, return null (no collapsed bar)
  if (isHidden) {
    return null;
  }

  const renderTask = (task: TaskWithUnread) => (
    <TaskTree
      key={task._id}
      task={task}
      defaultExpanded={expandTaskIds?.includes(task._id) ?? false}
      teamSlugOrId={teamSlugOrId}
      hasUnreadNotification={task.hasUnread}
    />
  );

  return (
    <div
      ref={containerRef}
      data-onboarding="sidebar"
      className="relative bg-neutral-50 dark:bg-black flex flex-col shrink-0 h-dvh grow pr-1 w-[75vw] snap-start snap-always md:w-auto md:snap-align-none"
      style={
        {
          width: undefined,
          minWidth: undefined,
          maxWidth: undefined,
          userSelect: isResizing ? ("none" as const) : undefined,
          "--sidebar-width": `${width}px`,
        } as CSSProperties
      }
    >
      <div
        className={`h-[38px] flex items-center pr-0.5 shrink-0 ${isElectron ? "" : "pl-3"}`}
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        {isElectron && <div className="w-[80px]"></div>}
        {/* Toggle sidebar button */}
        <button
          onClick={onToggleSidebar}
          className="w-[25px] h-[25px] flex items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-default mr-1"
          title="Toggle sidebar (Ctrl+Shift+S)"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <PanelLeft className="w-4 h-4" aria-hidden="true" />
        </button>
        <Link
          to="/$teamSlugOrId/dashboard"
          params={{ teamSlugOrId }}
          activeOptions={{ exact: true }}
          className="flex items-center gap-1.5 select-none cursor-pointer whitespace-nowrap"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <CmuxLogoMark height={20} label="cmux-next" />
          <span className="text-xs font-semibold tracking-wide text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
            cmux-next
          </span>
        </Link>
        <div className="grow"></div>
        <Link
          to="/$teamSlugOrId/dashboard"
          params={{ teamSlugOrId }}
          activeOptions={{ exact: true }}
          className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default"
          title="New task"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <Plus
            className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
            aria-hidden="true"
          />
        </Link>
      </div>
      <nav className="grow flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto pb-8">
          <ul className="flex flex-col gap-px">
            {navItems
              .filter((item) => !item.hidden)
              .map((item) => (
              <li
                key={item.label}
                {...(item.onboardingKey && { "data-onboarding": item.onboardingKey })}
              >
                <SidebarNavLink
                  to={item.to}
                  params={{ teamSlugOrId }}
                  search={item.search}
                  icon={item.icon}
                  exact={item.exact}
                  label={item.label}
                  badgeCount={item.showBadge ? unreadCount : undefined}
                />
              </li>
            ))}
          </ul>

          {isElectron && (
            <SidebarPullRequestSection teamSlugOrId={teamSlugOrId} />
          )}

          <div className="mt-2 flex flex-col gap-0.5">
            <SidebarWorkspacesSection
              teamSlugOrId={teamSlugOrId}
              preferences={wsPrefs.preferences}
              onOrganizeModeChange={wsPrefs.setOrganizeMode}
              onSortByChange={wsPrefs.setSortBy}
              onShowFilterChange={wsPrefs.setShowFilter}
            />
          </div>

          <div className="ml-2 pt-px">
            <div className="space-y-px">
              {tasks === undefined ? (
                <TaskTreeSkeleton count={5} />
              ) : (
                <>
                  {/* Pinned items at the top */}
                  {processedTasks.pinned.length > 0 && (
                    <>
                      {processedTasks.pinned.map(renderTask)}
                      {/* Horizontal divider after pinned items */}
                      <hr className="mx-2 border-t border-neutral-200 dark:border-neutral-800" />
                    </>
                  )}

                  {/* Grouped tasks (by-project mode) */}
                  {wsPrefs.preferences.organizeMode === "by-project" && processedTasks.groups.size > 0 && (
                    Array.from(processedTasks.groups.entries()).map(([groupKey, groupTasks]) => (
                      <SidebarProjectGroup
                        key={groupKey}
                        groupKey={groupKey}
                        displayName={getGroupDisplayName(groupKey)}
                        items={groupTasks}
                        isCollapsed={wsPrefs.isGroupCollapsed(groupKey)}
                        onToggleCollapse={() => wsPrefs.toggleGroupCollapsed(groupKey)}
                        isExpanded={wsPrefs.isGroupExpanded(groupKey)}
                        onToggleExpand={() => wsPrefs.toggleGroupExpanded(groupKey)}
                        renderItem={renderTask}
                        initialDisplayCount={10}
                      />
                    ))
                  )}

                  {/* Flat list (chronological mode) */}
                  {wsPrefs.preferences.organizeMode === "chronological" && processedTasks.flat.length > 0 && (
                    processedTasks.flat.map(renderTask)
                  )}

                  {/* No tasks message */}
                  {processedTasks.pinned.length === 0 &&
                    processedTasks.groups.size === 0 &&
                    processedTasks.flat.length === 0 && (
                    <p className="pl-2 pr-3 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
                      No recent tasks
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </nav>

      {/* Resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
        onMouseDown={startResizing}
        onDoubleClick={resetWidth}
        className="absolute top-0 right-0 h-full cursor-col-resize"
        style={
          {
            // Invisible, but with a comfortable hit area
            width: "14px",
            transform: "translateX(7px)",
            background: "transparent",
            zIndex: "var(--z-sidebar-resize-handle)",
          } as CSSProperties
        }
      />
    </div>
  );
}
