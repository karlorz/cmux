import { CmuxComments } from "@/components/cmux-comments";
import { CommandBar } from "@/components/CommandBar";
import { Sidebar } from "@/components/Sidebar";
import { SidebarContext } from "@/contexts/sidebar/SidebarContext";
import {
  SettingsSidebar,
  type SettingsSection,
} from "@/components/settings/SettingsSidebar";
import { SIDEBAR_PRS_DEFAULT_LIMIT } from "@/components/sidebar/const";
import { convexQueryClient } from "@/contexts/convex/convex-query-client";
import { ExpandTasksProvider } from "@/contexts/expand-tasks/ExpandTasksProvider";
import { cachedGetUser } from "@/lib/cachedGetUser";
import { isElectron } from "@/lib/electron";
import { setLastTeamSlugOrId } from "@/lib/lastTeam";
import { stackClientApp } from "@/lib/stack";
import { useMobileMachineHeartbeat } from "@/hooks/useMobileMachineHeartbeat";
import { api } from "@cmux/convex/api";
import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { env } from "@/client-env";
import { resolveActiveSettingsSection } from "./settings-section";

export const Route = createFileRoute("/_layout/$teamSlugOrId")({
  component: LayoutComponentWrapper,
  beforeLoad: async ({ params, location }) => {
    const user = await cachedGetUser(stackClientApp);
    if (!user) {
      throw redirect({
        to: "/sign-in",
        search: {
          after_auth_return_to: location.pathname,
        },
      });
    }
    const { teamSlugOrId } = params;
    let teamMemberships;
    try {
      teamMemberships = await convexQueryClient.convexClient.query(
        api.teams.listTeamMemberships
      );
    } catch (error) {
      // Auth token may be invalid/expired - redirect to sign-in
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Not authenticated")) {
        console.error("[beforeLoad] Convex auth failed, redirecting to sign-in:", message);
        throw redirect({
          to: "/sign-in",
          search: {
            after_auth_return_to: location.pathname,
          },
        });
      }
      throw error;
    }
    const teamMembership = teamMemberships.find((membership) => {
      const team = membership.team;
      const membershipTeamId = team?.teamId ?? membership.teamId;
      const membershipSlug = team?.slug;
      return (
        membershipSlug === teamSlugOrId || membershipTeamId === teamSlugOrId
      );
    });
    if (!teamMembership) {
      throw redirect({ to: "/team-picker" });
    }
  },
  loader: async ({ params }) => {
    // Prewarm PR query (paginated task query doesn't support prewarm)
    convexQueryClient.convexClient.prewarmQuery({
      query: api.github_prs.listPullRequests,
      args: {
        teamSlugOrId: params.teamSlugOrId,
        state: "open",
        limit: SIDEBAR_PRS_DEFAULT_LIMIT,
      },
    });
  },
});

function LayoutComponent() {
  const { teamSlugOrId } = Route.useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const initialPersistedDesktopSidebarHidden =
    typeof window !== "undefined"
      ? localStorage.getItem("sidebarHidden") === "true"
      : false;
  const [desktopSidebarPreferenceHidden, setDesktopSidebarPreferenceHidden] = useState(
    () => initialPersistedDesktopSidebarHidden
  );
  const [isMobileViewport, setIsMobileViewport] = useState(
    () =>
      typeof window !== "undefined" && "matchMedia" in window
        ? window.matchMedia("(max-width: 767px)").matches
        : false
  );
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  // In web mode, exclude local workspaces
  const excludeLocalWorkspaces = env.NEXT_PUBLIC_WEB_MODE || undefined;
  // Fetch all tasks - now efficient with by_team_user_active index
  // Sorted by lastActivityAt desc
  const tasks = useQuery(
    api.tasks.getWithNotificationOrder,
    { teamSlugOrId, excludeLocalWorkspaces }
  );
  const settingsPath = `/${teamSlugOrId}/settings`;
  const isSettingsRoute =
    location.pathname === settingsPath ||
    location.pathname === `${settingsPath}/` ||
    location.pathname.startsWith(`${settingsPath}/`);
  const sectionFromSearch = (location.search as { section?: unknown })?.section;
  const activeSettingsSection = resolveActiveSettingsSection(sectionFromSearch);
  const hasSyncedSidebarFromStorageRef = useRef(false);
  const isDesktopSidebarHidden = desktopSidebarPreferenceHidden;
  useMobileMachineHeartbeat({
    teamSlugOrId,
    tasks,
  });

  useEffect(() => {
    if (!hasSyncedSidebarFromStorageRef.current) {
      hasSyncedSidebarFromStorageRef.current = true;
      return;
    }

    setDesktopSidebarPreferenceHidden(
      localStorage.getItem("sidebarHidden") === "true"
    );
  }, [isSettingsRoute]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const syncViewport = (event?: MediaQueryListEvent) => {
      const matches = event?.matches ?? mediaQuery.matches;
      setIsMobileViewport(matches);
      if (!matches) {
        setIsMobileSidebarOpen(false);
      }
    };

    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "sidebarHidden" && event.newValue !== null) {
        setDesktopSidebarPreferenceHidden(event.newValue === "true");
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setDesktopSidebarHiddenWithPersistence = useCallback((hidden: boolean) => {
    localStorage.setItem("sidebarHidden", String(hidden));
    setDesktopSidebarPreferenceHidden(hidden);
  }, []);

  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [location.pathname, location.searchStr]);

  useEffect(() => {
    const handleSidebarToggle = () => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        setIsMobileSidebarOpen((prev) => !prev);
        return;
      }
      setDesktopSidebarHiddenWithPersistence(!isDesktopSidebarHidden);
    };

    let off: (() => void) | undefined;
    if (isElectron && window.cmux?.on) {
      off = window.cmux.on("shortcut:sidebar-toggle", handleSidebarToggle);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        !event.altKey &&
        !event.metaKey &&
        (event.code === "KeyS" || event.key.toLowerCase() === "s")
      ) {
        event.preventDefault();
        event.stopPropagation();
        handleSidebarToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("cmux:sidebar-toggle", handleSidebarToggle);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("cmux:sidebar-toggle", handleSidebarToggle);
      off?.();
    };
  }, [isDesktopSidebarHidden, isMobileViewport, setDesktopSidebarHiddenWithPersistence]);

  const handleSettingsSectionChange = useCallback(
    (section: SettingsSection) => {
      if (isSettingsRoute && section === activeSettingsSection) return;
      void navigate({
        to: "/$teamSlugOrId/settings",
        params: { teamSlugOrId },
        search: {
          section: section === "general" ? undefined : section,
        },
        replace: true,
      });
    },
    [activeSettingsSection, isSettingsRoute, navigate, teamSlugOrId]
  );

  const isSidebarHidden = isMobileViewport ? !isMobileSidebarOpen : isDesktopSidebarHidden;

  const handleSetSidebarHidden = useCallback(
    (hidden: boolean) => {
      if (isMobileViewport) {
        setIsMobileSidebarOpen(!hidden);
        return;
      }
      setDesktopSidebarHiddenWithPersistence(hidden);
    },
    [isMobileViewport, setDesktopSidebarHiddenWithPersistence]
  );

  const handleToggleSidebar = useCallback(() => {
    if (isMobileViewport) {
      setIsMobileSidebarOpen((prev) => !prev);
      return;
    }
    setDesktopSidebarHiddenWithPersistence(!isDesktopSidebarHidden);
  }, [isDesktopSidebarHidden, isMobileViewport, setDesktopSidebarHiddenWithPersistence]);

  const sidebarContextValue = useMemo(
    () => ({
      isHidden: isSidebarHidden,
      setIsHidden: handleSetSidebarHidden,
      toggle: handleToggleSidebar,
    }),
    [handleSetSidebarHidden, handleToggleSidebar, isSidebarHidden]
  );

  const sidebarContent = isSettingsRoute ? (
    <SettingsSidebar
      teamSlugOrId={teamSlugOrId}
      activeSection={activeSettingsSection}
      onSectionChange={handleSettingsSectionChange}
      onToggleHidden={() => handleSetSidebarHidden(true)}
      isMobileViewport={isMobileViewport}
    />
  ) : (
    <Sidebar
      tasks={tasks}
      teamSlugOrId={teamSlugOrId}
      onToggleHidden={() => handleSetSidebarHidden(true)}
      isMobileViewport={isMobileViewport}
    />
  );

  const handleMobileShellTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!isMobileViewport || isMobileSidebarOpen) {
        touchStartXRef.current = null;
        return;
      }
      touchStartXRef.current = event.touches[0]?.clientX ?? null;
    },
    [isMobileSidebarOpen, isMobileViewport]
  );

  const handleMobileShellTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!isMobileViewport || isMobileSidebarOpen || touchStartXRef.current === null) {
        touchStartXRef.current = null;
        return;
      }

      const startX = touchStartXRef.current;
      const endX = event.changedTouches[0]?.clientX ?? startX;
      touchStartXRef.current = null;

      if (startX > 24 || endX - startX < 56) {
        return;
      }

      setIsMobileSidebarOpen(true);
    },
    [isMobileSidebarOpen, isMobileViewport]
  );

  return (
    <ExpandTasksProvider>
      <SidebarContext.Provider value={sidebarContextValue}>
        <CommandBar teamSlugOrId={teamSlugOrId} />

        <div
          className="relative flex flex-row grow min-h-0 h-dvh bg-white dark:bg-black overflow-hidden md:overflow-x-visible"
          onTouchStart={handleMobileShellTouchStart}
          onTouchEnd={handleMobileShellTouchEnd}
        >
          {isMobileViewport ? (
            isMobileSidebarOpen ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="absolute inset-0 z-[var(--z-overlay-behind)] bg-neutral-950/50 backdrop-blur-[1px] md:hidden"
                  aria-label="Close menu"
                />
                <div className="absolute inset-y-0 left-0 z-[var(--z-overlay)] shadow-2xl md:hidden">
                  {sidebarContent}
                </div>
              </>
            ) : null
          ) : isSidebarHidden ? null : (
            sidebarContent
          )}

          <div className="min-w-0 grow flex flex-col">
            <Suspense fallback={<div>Loading...</div>}>
              <Outlet />
            </Suspense>
          </div>
        </div>

        <button
          onClick={() => {
            const msg = window.prompt("Enter debug note");
            if (msg) {
              // Prefix allows us to easily grep in the console.
              console.log(`[USER NOTE] ${msg}`);
            }
          }}
          className="hidden"
          style={{
            position: "fixed",
            bottom: "16px",
            right: "16px",
            zIndex: "var(--z-overlay)",
            background: "#ffbf00",
            color: "#000",
            border: "none",
            borderRadius: "4px",
            padding: "8px 12px",
            cursor: "default",
            fontSize: "12px",
            fontWeight: 600,
            boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
          }}
        >
          Add Debug Note
        </button>
      </SidebarContext.Provider>
    </ExpandTasksProvider>
  );
}

// ConvexClientProvider is already applied in the top-level `/_layout` route.
// Avoid nesting providers here to prevent auth/loading thrash.
function LayoutComponentWrapper() {
  const { teamSlugOrId } = Route.useParams();
  useEffect(() => {
    setLastTeamSlugOrId(teamSlugOrId);
  }, [teamSlugOrId]);
  return (
    <>
      <LayoutComponent />
      <CmuxComments teamSlugOrId={teamSlugOrId} />
    </>
  );
}
