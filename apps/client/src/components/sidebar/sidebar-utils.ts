import type { ShowFilter, SortBy } from "./sidebar-types";

export interface SidebarGroup<T> {
  key: string;
  items: T[];
}

export interface SidebarFilterOptions<T> {
  getCreatedAt?: (item: T) => number | null | undefined;
  getUpdatedAt?: (item: T) => number | null | undefined;
  getHasUnread?: (item: T) => boolean;
  now?: number;
}

export type SidebarSortValueGetter<T> = (
  item: T,
  sortBy: SortBy
) => number | null | undefined;

export const SIDEBAR_OTHER_GROUP_KEY = "__other__";

const RELEVANT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeTimestamp(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  return value;
}

export function groupItems<T>(
  items: T[],
  getGroupKey: (item: T) => string | null | undefined
): SidebarGroup<T>[] {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const rawKey = getGroupKey(item)?.trim();
    const groupKey = rawKey && rawKey.length > 0 ? rawKey : SIDEBAR_OTHER_GROUP_KEY;
    const existing = groups.get(groupKey);

    if (existing) {
      existing.push(item);
    } else {
      groups.set(groupKey, [item]);
    }
  }

  return Array.from(groups.entries()).map(([key, groupedItems]) => ({
    key,
    items: groupedItems,
  }));
}

export function sortItems<T>(
  items: T[],
  sortBy: SortBy,
  getSortValue: SidebarSortValueGetter<T>
): T[] {
  return [...items].sort((a, b) => {
    const valueA = normalizeTimestamp(getSortValue(a, sortBy));
    const valueB = normalizeTimestamp(getSortValue(b, sortBy));
    return valueB - valueA;
  });
}

export function sortGroupItems<T>(
  groups: SidebarGroup<T>[],
  sortBy: SortBy,
  getSortValue: SidebarSortValueGetter<T>
): SidebarGroup<T>[] {
  return groups.map((group) => ({
    ...group,
    items: sortItems(group.items, sortBy, getSortValue),
  }));
}

export function sortGroups<T>(
  groups: SidebarGroup<T>[],
  sortBy: SortBy,
  getSortValue: SidebarSortValueGetter<T>
): SidebarGroup<T>[] {
  const sortedGroups = [...groups].sort((a, b) => {
    if (a.key === SIDEBAR_OTHER_GROUP_KEY && b.key !== SIDEBAR_OTHER_GROUP_KEY) {
      return 1;
    }
    if (b.key === SIDEBAR_OTHER_GROUP_KEY && a.key !== SIDEBAR_OTHER_GROUP_KEY) {
      return -1;
    }

    const mostRecentA = a.items.reduce((max, item) => {
      const value = normalizeTimestamp(getSortValue(item, sortBy));
      return value > max ? value : max;
    }, 0);
    const mostRecentB = b.items.reduce((max, item) => {
      const value = normalizeTimestamp(getSortValue(item, sortBy));
      return value > max ? value : max;
    }, 0);

    if (mostRecentB !== mostRecentA) {
      return mostRecentB - mostRecentA;
    }

    return a.key.localeCompare(b.key);
  });

  return sortedGroups;
}

export function filterRelevant<T>(
  items: T[],
  showFilter: ShowFilter,
  options: SidebarFilterOptions<T>
): T[] {
  if (showFilter === "all") {
    return items;
  }

  const now = options.now ?? Date.now();
  const cutoff = now - RELEVANT_WINDOW_MS;

  return items.filter((item) => {
    if (options.getHasUnread?.(item)) {
      return true;
    }

    const updatedAt = normalizeTimestamp(options.getUpdatedAt?.(item));
    const createdAt = normalizeTimestamp(options.getCreatedAt?.(item));
    const lastActivity = Math.max(updatedAt, createdAt);

    return lastActivity >= cutoff;
  });
}

export function formatSidebarGroupLabel(groupKey: string): string {
  if (groupKey === SIDEBAR_OTHER_GROUP_KEY) {
    return "Other";
  }

  const trimmed = groupKey.trim();
  if (!trimmed) {
    return "Other";
  }

  const [owner, repo] = trimmed.split("/", 2);
  if (owner && repo) {
    return repo;
  }

  return trimmed;
}
