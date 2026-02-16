import type { SortBy, ShowFilter } from "./sidebar-types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface GroupedItems<T> {
  groupKey: string;
  items: T[];
}

/**
 * Groups items by a key derived from each item
 */
export function groupItems<T>(
  items: T[],
  getGroupKey: (item: T) => string | undefined
): GroupedItems<T>[] {
  const groupMap = new Map<string, T[]>();
  const ungrouped: T[] = [];

  for (const item of items) {
    const key = getGroupKey(item);
    if (!key) {
      ungrouped.push(item);
      continue;
    }
    const group = groupMap.get(key);
    if (group) {
      group.push(item);
    } else {
      groupMap.set(key, [item]);
    }
  }

  const groups: GroupedItems<T>[] = [];
  for (const [groupKey, groupItems] of groupMap) {
    groups.push({ groupKey, items: groupItems });
  }

  // Add ungrouped items under "Other" if any exist
  if (ungrouped.length > 0) {
    groups.push({ groupKey: "Other", items: ungrouped });
  }

  return groups;
}

/**
 * Sorts items within each group by the specified sort field
 */
export function sortGroupItems<T>(
  groups: GroupedItems<T>[],
  sortBy: SortBy,
  getSortValue: (item: T, sortBy: SortBy) => number
): GroupedItems<T>[] {
  return groups.map((group) => ({
    ...group,
    items: [...group.items].sort(
      (a, b) => getSortValue(b, sortBy) - getSortValue(a, sortBy)
    ),
  }));
}

/**
 * Sorts groups by most recent item within each group
 */
export function sortGroups<T>(
  groups: GroupedItems<T>[],
  sortBy: SortBy,
  getSortValue: (item: T, sortBy: SortBy) => number
): GroupedItems<T>[] {
  return [...groups].sort((a, b) => {
    // "Other" group always goes to the bottom
    if (a.groupKey === "Other") return 1;
    if (b.groupKey === "Other") return -1;

    const aMax = Math.max(...a.items.map((item) => getSortValue(item, sortBy)));
    const bMax = Math.max(...b.items.map((item) => getSortValue(item, sortBy)));
    return bMax - aMax;
  });
}

/**
 * Filters items based on the show filter setting
 * - "all": Returns all items
 * - "relevant": Returns items with unread notifications OR activity in last 7 days
 */
export function filterRelevant<T>(
  items: T[],
  showFilter: ShowFilter,
  getRelevance: (item: T) => { hasUnread: boolean; lastActivityTime: number }
): T[] {
  if (showFilter === "all") {
    return items;
  }

  const now = Date.now();
  return items.filter((item) => {
    const { hasUnread, lastActivityTime } = getRelevance(item);
    const isRecent = now - lastActivityTime < SEVEN_DAYS_MS;
    return hasUnread || isRecent;
  });
}

/**
 * Sorts a flat list of items by the specified sort field
 */
export function sortItems<T>(
  items: T[],
  sortBy: SortBy,
  getSortValue: (item: T, sortBy: SortBy) => number
): T[] {
  return [...items].sort(
    (a, b) => getSortValue(b, sortBy) - getSortValue(a, sortBy)
  );
}

/**
 * Extracts display name from a group key (e.g., "owner/repo" -> "repo")
 */
export function getGroupDisplayName(groupKey: string): string {
  if (groupKey === "Other") {
    return "Other";
  }
  const parts = groupKey.split("/");
  return parts[parts.length - 1] || groupKey;
}
