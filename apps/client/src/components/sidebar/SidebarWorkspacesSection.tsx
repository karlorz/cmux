import { env } from "@/client-env";
import { Dropdown } from "@/components/ui/dropdown";
import clsx from "clsx";
import { Cloud, Monitor, Plus } from "lucide-react";
import { useCallback } from "react";
import { SidebarSectionHeader } from "./SidebarSectionHeader";
import type { OrganizeMode, SectionPreferences, ShowFilter, SortBy } from "./sidebar-types";

interface SidebarWorkspacesSectionProps {
  teamSlugOrId: string;
  preferences: SectionPreferences;
  onOrganizeModeChange: (mode: OrganizeMode) => void;
  onSortByChange: (sort: SortBy) => void;
  onShowFilterChange: (filter: ShowFilter) => void;
}

function openCommandBarWithPage(page: string) {
  window.dispatchEvent(
    new CustomEvent("cmux:open-command-bar", { detail: { page } })
  );
}

export function SidebarWorkspacesSection({
  teamSlugOrId,
  preferences,
  onOrganizeModeChange,
  onSortByChange,
  onShowFilterChange,
}: SidebarWorkspacesSectionProps) {
  const handleLocalWorkspace = useCallback(() => {
    openCommandBarWithPage("local-workspaces");
  }, []);

  const handleCloudWorkspace = useCallback(() => {
    openCommandBarWithPage("cloud-workspaces");
  }, []);

  const newWorkspaceButton = (
    <Dropdown.Root>
      <Dropdown.Trigger
        className={clsx(
          "p-1 flex items-center justify-center rounded",
          "text-neutral-500 dark:text-neutral-400",
          "hover:text-neutral-700 dark:hover:text-neutral-200",
          "hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50",
          "transition-colors"
        )}
        title="New workspace"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Positioner sideOffset={4} side="bottom" align="end">
          <Dropdown.Popup className="min-w-[180px]">
            {!env.NEXT_PUBLIC_WEB_MODE && (
              <Dropdown.Item
                onClick={handleLocalWorkspace}
                className="flex items-center gap-2"
              >
                <Monitor className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span>Local Workspace</span>
              </Dropdown.Item>
            )}
            <Dropdown.Item
              onClick={handleCloudWorkspace}
              className="flex items-center gap-2"
            >
              <Cloud className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
              <span>Cloud Workspace</span>
            </Dropdown.Item>
          </Dropdown.Popup>
        </Dropdown.Positioner>
      </Dropdown.Portal>
    </Dropdown.Root>
  );

  return (
    <SidebarSectionHeader
      title="Workspaces"
      to="/$teamSlugOrId/workspaces"
      teamSlugOrId={teamSlugOrId}
      preferences={preferences}
      onOrganizeModeChange={onOrganizeModeChange}
      onSortByChange={onSortByChange}
      onShowFilterChange={onShowFilterChange}
      trailing={newWorkspaceButton}
      onboardingKey="workspaces-link"
    />
  );
}
