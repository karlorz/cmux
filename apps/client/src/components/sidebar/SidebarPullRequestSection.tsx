import { SidebarSectionHeader } from "./SidebarSectionHeader";
import { SidebarPullRequestList } from "./SidebarPullRequestList";
import { useSidebarPreferences } from "./useSidebarPreferences";
import { SIDEBAR_PR_PREFS_KEY } from "./sidebar-types";

interface SidebarPullRequestSectionProps {
  teamSlugOrId: string;
}

export function SidebarPullRequestSection({
  teamSlugOrId,
}: SidebarPullRequestSectionProps) {
  const prPrefs = useSidebarPreferences(SIDEBAR_PR_PREFS_KEY);

  return (
    <div className="mt-4 flex flex-col">
      <SidebarSectionHeader
        title="Pull requests"
        to="/$teamSlugOrId/prs"
        teamSlugOrId={teamSlugOrId}
        preferences={prPrefs.preferences}
        onOrganizeModeChange={prPrefs.setOrganizeMode}
        onSortByChange={prPrefs.setSortBy}
        onShowFilterChange={prPrefs.setShowFilter}
      />
      <div className="ml-2 pt-px">
        <SidebarPullRequestList
          teamSlugOrId={teamSlugOrId}
          preferences={prPrefs.preferences}
          isGroupCollapsed={prPrefs.isGroupCollapsed}
          toggleGroupCollapsed={prPrefs.toggleGroupCollapsed}
          isGroupExpanded={prPrefs.isGroupExpanded}
          toggleGroupExpanded={prPrefs.toggleGroupExpanded}
        />
      </div>
    </div>
  );
}
