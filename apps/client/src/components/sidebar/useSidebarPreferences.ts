import { useCallback, useEffect, useState } from "react";
import {
  type OrganizeMode,
  type ShowFilter,
  type SidebarPreferences,
  type SortBy,
  DEFAULT_SIDEBAR_PREFERENCES,
  SIDEBAR_PREFS_KEY,
} from "./sidebar-types";

function loadPreferences(): SidebarPreferences {
  try {
    const stored = localStorage.getItem(SIDEBAR_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SidebarPreferences>;
      return {
        ...DEFAULT_SIDEBAR_PREFERENCES,
        ...parsed,
      };
    }
  } catch (error) {
    console.error("Failed to load sidebar preferences:", error);
  }
  return DEFAULT_SIDEBAR_PREFERENCES;
}

function savePreferences(prefs: SidebarPreferences): void {
  try {
    localStorage.setItem(SIDEBAR_PREFS_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.error("Failed to save sidebar preferences:", error);
  }
}

export function useSidebarPreferences() {
  const [preferences, setPreferences] = useState<SidebarPreferences>(loadPreferences);

  // Persist preferences on change
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  // Listen for storage events from other tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_PREFS_KEY && e.newValue !== null) {
        try {
          const parsed = JSON.parse(e.newValue) as Partial<SidebarPreferences>;
          setPreferences({
            ...DEFAULT_SIDEBAR_PREFERENCES,
            ...parsed,
          });
        } catch (error) {
          console.error("Failed to parse sidebar preferences from storage:", error);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setOrganizeMode = useCallback((mode: OrganizeMode) => {
    setPreferences((prev) => ({ ...prev, organizeMode: mode }));
  }, []);

  const setSortBy = useCallback((sortBy: SortBy) => {
    setPreferences((prev) => ({ ...prev, sortBy }));
  }, []);

  const setShowFilter = useCallback((filter: ShowFilter) => {
    setPreferences((prev) => ({ ...prev, showFilter: filter }));
  }, []);

  const toggleGroupExpanded = useCallback((groupKey: string) => {
    setPreferences((prev) => ({
      ...prev,
      expandedGroups: {
        ...prev.expandedGroups,
        [groupKey]: !prev.expandedGroups[groupKey],
      },
    }));
  }, []);

  const setGroupExpanded = useCallback((groupKey: string, expanded: boolean) => {
    setPreferences((prev) => ({
      ...prev,
      expandedGroups: {
        ...prev.expandedGroups,
        [groupKey]: expanded,
      },
    }));
  }, []);

  return {
    preferences,
    setOrganizeMode,
    setSortBy,
    setShowFilter,
    toggleGroupExpanded,
    setGroupExpanded,
  };
}
