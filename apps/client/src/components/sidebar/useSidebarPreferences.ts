import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  SIDEBAR_PREFS_KEY,
  type OrganizeMode,
  type ShowFilter,
  type SidebarPreferences,
  type SortBy,
} from "./sidebar-types";

interface UseSidebarPreferencesResult {
  preferences: SidebarPreferences;
  setOrganizeMode: (mode: OrganizeMode) => void;
  setSortBy: (sortBy: SortBy) => void;
  setShowFilter: (showFilter: ShowFilter) => void;
  setGroupExpanded: (groupKey: string, isExpanded: boolean) => void;
  toggleGroupExpanded: (groupKey: string) => void;
  clearExpandedGroups: () => void;
}

function isOrganizeMode(value: unknown): value is OrganizeMode {
  return value === "by-project" || value === "chronological";
}

function isSortBy(value: unknown): value is SortBy {
  return value === "created" || value === "updated";
}

function isShowFilter(value: unknown): value is ShowFilter {
  return value === "all" || value === "relevant";
}

function parseExpandedGroups(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, flag]) => typeof flag === "boolean"
  );

  return Object.fromEntries(entries) as Record<string, boolean>;
}

function parseSidebarPreferences(rawValue: string | null): SidebarPreferences {
  if (!rawValue) {
    return DEFAULT_SIDEBAR_PREFERENCES;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SidebarPreferences>;

    return {
      organizeMode: isOrganizeMode(parsed.organizeMode)
        ? parsed.organizeMode
        : DEFAULT_SIDEBAR_PREFERENCES.organizeMode,
      sortBy: isSortBy(parsed.sortBy)
        ? parsed.sortBy
        : DEFAULT_SIDEBAR_PREFERENCES.sortBy,
      showFilter: isShowFilter(parsed.showFilter)
        ? parsed.showFilter
        : DEFAULT_SIDEBAR_PREFERENCES.showFilter,
      expandedGroups: parseExpandedGroups(parsed.expandedGroups),
    };
  } catch {
    return DEFAULT_SIDEBAR_PREFERENCES;
  }
}

export function useSidebarPreferences(): UseSidebarPreferencesResult {
  const [preferences, setPreferences] = useState<SidebarPreferences>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SIDEBAR_PREFERENCES;
    }

    return parseSidebarPreferences(
      window.localStorage.getItem(SIDEBAR_PREFS_KEY)
    );
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SIDEBAR_PREFS_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const setOrganizeMode = useCallback((mode: OrganizeMode) => {
    setPreferences((current) => ({
      ...current,
      organizeMode: mode,
    }));
  }, []);

  const setSortBy = useCallback((sortBy: SortBy) => {
    setPreferences((current) => ({
      ...current,
      sortBy,
    }));
  }, []);

  const setShowFilter = useCallback((showFilter: ShowFilter) => {
    setPreferences((current) => ({
      ...current,
      showFilter,
    }));
  }, []);

  const setGroupExpanded = useCallback((groupKey: string, isExpanded: boolean) => {
    setPreferences((current) => ({
      ...current,
      expandedGroups: {
        ...current.expandedGroups,
        [groupKey]: isExpanded,
      },
    }));
  }, []);

  const toggleGroupExpanded = useCallback((groupKey: string) => {
    setPreferences((current) => ({
      ...current,
      expandedGroups: {
        ...current.expandedGroups,
        [groupKey]: !(current.expandedGroups[groupKey] ?? false),
      },
    }));
  }, []);

  const clearExpandedGroups = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      expandedGroups: {},
    }));
  }, []);

  return useMemo(
    () => ({
      preferences,
      setOrganizeMode,
      setSortBy,
      setShowFilter,
      setGroupExpanded,
      toggleGroupExpanded,
      clearExpandedGroups,
    }),
    [
      preferences,
      setOrganizeMode,
      setSortBy,
      setShowFilter,
      setGroupExpanded,
      toggleGroupExpanded,
      clearExpandedGroups,
    ]
  );
}
