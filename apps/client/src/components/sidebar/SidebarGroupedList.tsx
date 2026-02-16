import { type ReactNode, useMemo } from "react";
import type { OrganizeMode, ShowFilter, SortBy } from "./sidebar-types";
import {
  filterRelevant,
  groupItems,
  sortGroupItems,
  sortGroups,
  sortItems,
  type SidebarSortValueGetter,
} from "./sidebar-utils";
import { SidebarProjectGroup } from "./SidebarProjectGroup";

interface SidebarGroupedListProps<T> {
  items: T[];
  organizeMode: OrganizeMode;
  sortBy: SortBy;
  showFilter: ShowFilter;
  getItemKey: (item: T, index: number) => string;
  groupByKey: (item: T) => string | null | undefined;
  getCreatedAt: (item: T) => number | null | undefined;
  getUpdatedAt: (item: T) => number | null | undefined;
  getHasUnread?: (item: T) => boolean;
  renderItem: (item: T, index: number) => ReactNode;
  expandedGroups?: Record<string, boolean>;
  onToggleGroupExpand?: (groupKey: string) => void;
  groupKeyPrefix?: string;
  initialDisplayCount?: number;
  emptyText?: string;
  className?: string;
}

export function SidebarGroupedList<T>({
  items,
  organizeMode,
  sortBy,
  showFilter,
  getItemKey,
  groupByKey,
  getCreatedAt,
  getUpdatedAt,
  getHasUnread,
  renderItem,
  expandedGroups = {},
  onToggleGroupExpand,
  groupKeyPrefix,
  initialDisplayCount = 5,
  emptyText,
  className,
}: SidebarGroupedListProps<T>) {
  const getSortValue = useMemo<SidebarSortValueGetter<T>>(
    () =>
      (item, activeSortBy) => {
        if (activeSortBy === "created") {
          return getCreatedAt(item);
        }
        return getUpdatedAt(item) ?? getCreatedAt(item);
      },
    [getCreatedAt, getUpdatedAt]
  );

  const filteredItems = useMemo(
    () =>
      filterRelevant(items, showFilter, {
        getCreatedAt,
        getUpdatedAt,
        getHasUnread,
      }),
    [items, showFilter, getCreatedAt, getUpdatedAt, getHasUnread]
  );

  if (filteredItems.length === 0) {
    return emptyText ? (
      <p className="pl-2 pr-3 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
        {emptyText}
      </p>
    ) : null;
  }

  if (organizeMode === "chronological") {
    const sortedItems = sortItems(filteredItems, sortBy, getSortValue);

    return (
      <div className={className}>
        {sortedItems.map((item, index) => (
          <div key={getItemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const groupedItems = sortGroups(
    sortGroupItems(groupItems(filteredItems, groupByKey), sortBy, getSortValue),
    sortBy,
    getSortValue
  );

  return (
    <div className={className}>
      {groupedItems.map((group) => {
        const expandedKey = groupKeyPrefix
          ? `${groupKeyPrefix}:${group.key}`
          : group.key;

        return (
          <SidebarProjectGroup
            key={expandedKey}
            groupKey={group.key}
            items={group.items}
            isExpanded={expandedGroups[expandedKey] ?? false}
            onToggleExpand={() => onToggleGroupExpand?.(expandedKey)}
            renderItem={renderItem}
            getItemKey={getItemKey}
            initialDisplayCount={initialDisplayCount}
          />
        );
      })}
    </div>
  );
}

export default SidebarGroupedList;
