import type { ShowFilter, SortBy } from "./sidebar-types";

export const OTHER_GROUP_KEY = "__other__";

export function groupItemsByProject<T>(
  items: T[],
  getGroupKey: (item: T) => string | undefined
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  const otherItems: T[] = [];

  for (const item of items) {
    const key = getGroupKey(item)?.trim();
    if (!key) {
      otherItems.push(item);
      continue;
    }

    const existing = grouped.get(key);
    if (existing) {
      existing.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  if (otherItems.length > 0) {
    grouped.set(OTHER_GROUP_KEY, otherItems);
  }

  return grouped;
}

export function sortItems<T>(
  items: T[],
  sortBy: SortBy,
  getSortValue: (item: T) => number
): T[] {
  return [...items].sort((a, b) => {
    const aValue = getSortValue(a);
    const bValue = getSortValue(b);
    const diff = bValue - aValue;
    if (diff !== 0) {
      return diff;
    }

    // Keep stable ordering on equal timestamps regardless of selected sort mode.
    if (sortBy === "updated") {
      return 0;
    }
    return 0;
  });
}

export function filterRelevant<T>(
  items: T[],
  showFilter: ShowFilter,
  isRelevant: (item: T) => boolean
): T[] {
  if (showFilter === "all") {
    return items;
  }
  return items.filter(isRelevant);
}

export function getGroupDisplayName(groupKey: string): string {
  if (groupKey === OTHER_GROUP_KEY) {
    return "Other";
  }

  const [, repo = groupKey] = groupKey.split("/", 2);
  return repo || groupKey;
}
