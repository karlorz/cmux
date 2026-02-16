import { OTHER_GROUP_KEY, OTHER_GROUP_DISPLAY_NAME, type SortBy, type ShowFilter } from "./sidebar-types";

/**
 * Groups items by a key extracted from each item.
 * Items without a key are grouped under OTHER_GROUP_KEY.
 * Returns a Map with group keys as keys, preserving insertion order.
 */
export function groupItemsByProject<T>(
  items: T[],
  getGroupKey: (item: T) => string | undefined
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  const otherItems: T[] = [];

  for (const item of items) {
    const key = getGroupKey(item);
    if (!key) {
      otherItems.push(item);
      continue;
    }

    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  // Add "Other" group at the end if there are ungrouped items
  if (otherItems.length > 0) {
    groups.set(OTHER_GROUP_KEY, otherItems);
  }

  return groups;
}

/**
 * Sorts items by the specified field.
 * Uses the getSortValue function to extract the numeric sort value.
 * Returns a new sorted array (does not mutate input).
 */
export function sortItems<T>(
  items: T[],
  sortBy: SortBy,
  getSortValue: (item: T, sortBy: SortBy) => number
): T[] {
  return [...items].sort((a, b) => {
    // Sort descending (most recent first)
    return getSortValue(b, sortBy) - getSortValue(a, sortBy);
  });
}

/**
 * Filters items based on the show filter.
 * Uses the isRelevant function to determine if an item should be shown.
 * Returns a new filtered array (does not mutate input).
 */
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

/**
 * Extracts the display name from a group key.
 * For "owner/repo" format, returns "repo".
 * For OTHER_GROUP_KEY, returns "Other".
 * For other formats, returns the key as-is.
 */
export function getGroupDisplayName(groupKey: string): string {
  if (groupKey === OTHER_GROUP_KEY) {
    return OTHER_GROUP_DISPLAY_NAME;
  }

  // Handle "owner/repo" format
  const parts = groupKey.split("/");
  if (parts.length >= 2) {
    return parts[parts.length - 1] ?? groupKey;
  }

  return groupKey;
}

/**
 * Determines if an item is "relevant" based on activity within the last 7 days
 * or having an unread notification.
 */
export function isItemRelevant(
  lastActivityMs: number,
  hasUnread: boolean,
  daysThreshold = 7
): boolean {
  if (hasUnread) {
    return true;
  }

  const now = Date.now();
  const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000;
  return now - lastActivityMs < thresholdMs;
}
