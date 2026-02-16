export type OrganizeMode = "by-project" | "chronological";
export type SortBy = "created" | "updated";
export type ShowFilter = "all" | "relevant";

export interface SidebarPreferences {
  organizeMode: OrganizeMode;
  sortBy: SortBy;
  showFilter: ShowFilter;
  expandedGroups: Record<string, boolean>;
}

export const SIDEBAR_PREFS_KEY = "cmux:sidebar-preferences";

export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  organizeMode: "by-project",
  sortBy: "created",
  showFilter: "relevant",
  expandedGroups: {},
};
