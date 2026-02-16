import { useCallback, useState } from "react";
import {
  DEFAULT_SECTION_PREFERENCES,
  type OrganizeMode,
  type SectionPreferences,
  type ShowFilter,
  type SortBy,
} from "./sidebar-types";

function loadPreferences(storageKey: string): SectionPreferences {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<SectionPreferences>;
      return {
        ...DEFAULT_SECTION_PREFERENCES,
        ...parsed,
        collapsedGroups: parsed.collapsedGroups ?? {},
        expandedGroups: parsed.expandedGroups ?? {},
      };
    }
  } catch (error) {
    console.error(`Failed to load sidebar preferences from ${storageKey}:`, error);
  }
  return { ...DEFAULT_SECTION_PREFERENCES };
}

function savePreferences(storageKey: string, prefs: SectionPreferences): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch (error) {
    console.error(`Failed to save sidebar preferences to ${storageKey}:`, error);
  }
}

export interface UseSidebarPreferencesResult {
  preferences: SectionPreferences;
  setOrganizeMode: (mode: OrganizeMode) => void;
  setSortBy: (sort: SortBy) => void;
  setShowFilter: (filter: ShowFilter) => void;
  toggleGroupCollapsed: (groupKey: string) => void;
  toggleGroupExpanded: (groupKey: string) => void;
  isGroupCollapsed: (groupKey: string) => boolean;
  isGroupExpanded: (groupKey: string) => boolean;
}

export function useSidebarPreferences(
  storageKey: string
): UseSidebarPreferencesResult {
  const [preferences, setPreferences] = useState<SectionPreferences>(() =>
    loadPreferences(storageKey)
  );

  const updateAndSave = useCallback(
    (updater: (prev: SectionPreferences) => SectionPreferences) => {
      setPreferences((prev) => {
        const next = updater(prev);
        savePreferences(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const setOrganizeMode = useCallback(
    (mode: OrganizeMode) => {
      updateAndSave((prev) => ({ ...prev, organizeMode: mode }));
    },
    [updateAndSave]
  );

  const setSortBy = useCallback(
    (sort: SortBy) => {
      updateAndSave((prev) => ({ ...prev, sortBy: sort }));
    },
    [updateAndSave]
  );

  const setShowFilter = useCallback(
    (filter: ShowFilter) => {
      updateAndSave((prev) => ({ ...prev, showFilter: filter }));
    },
    [updateAndSave]
  );

  const toggleGroupCollapsed = useCallback(
    (groupKey: string) => {
      updateAndSave((prev) => ({
        ...prev,
        collapsedGroups: {
          ...prev.collapsedGroups,
          [groupKey]: !prev.collapsedGroups[groupKey],
        },
      }));
    },
    [updateAndSave]
  );

  const toggleGroupExpanded = useCallback(
    (groupKey: string) => {
      updateAndSave((prev) => ({
        ...prev,
        expandedGroups: {
          ...prev.expandedGroups,
          [groupKey]: !prev.expandedGroups[groupKey],
        },
      }));
    },
    [updateAndSave]
  );

  const isGroupCollapsed = useCallback(
    (groupKey: string): boolean => {
      return preferences.collapsedGroups[groupKey] ?? false;
    },
    [preferences.collapsedGroups]
  );

  const isGroupExpanded = useCallback(
    (groupKey: string): boolean => {
      return preferences.expandedGroups[groupKey] ?? false;
    },
    [preferences.expandedGroups]
  );

  return {
    preferences,
    setOrganizeMode,
    setSortBy,
    setShowFilter,
    toggleGroupCollapsed,
    toggleGroupExpanded,
    isGroupCollapsed,
    isGroupExpanded,
  };
}
