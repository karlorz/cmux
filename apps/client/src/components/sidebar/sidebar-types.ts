// Sidebar filter/sort/organize types

export type OrganizeMode = "by-project" | "chronological";
export type SortBy = "created" | "updated";
export type ShowFilter = "all" | "relevant";

export interface SidebarPreferences {
  organizeMode: OrganizeMode;
  sortBy: SortBy;
  showFilter: ShowFilter;
}

export interface SectionPreferences extends SidebarPreferences {
  /** Keys are group identifiers (e.g., "owner/repo"), values indicate collapsed state */
  collapsedGroups: Record<string, boolean>;
  /** Keys are group identifiers, values indicate "Show more" expanded state */
  expandedGroups: Record<string, boolean>;
}

export const SIDEBAR_PR_PREFS_KEY = "cmux:sidebar-pr-preferences";
export const SIDEBAR_WS_PREFS_KEY = "cmux:sidebar-ws-preferences";

export const DEFAULT_PREFERENCES: SidebarPreferences = {
  organizeMode: "by-project",
  sortBy: "created",
  showFilter: "relevant",
};

export const DEFAULT_SECTION_PREFERENCES: SectionPreferences = {
  ...DEFAULT_PREFERENCES,
  collapsedGroups: {},
  expandedGroups: {},
};

/** Group key used for items without a projectFullName/repoFullName */
export const OTHER_GROUP_KEY = "__other__";
export const OTHER_GROUP_DISPLAY_NAME = "Other";
