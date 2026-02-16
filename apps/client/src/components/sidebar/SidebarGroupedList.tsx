import type { ReactNode } from "react";
import { useMemo } from "react";
import type { OrganizeMode, SortBy } from "./sidebar-types";
import {
  groupItems,
  sortGroupItems,
  sortGroups,
  sortItems,
} from "./sidebar-utils";
import { SidebarProjectGroup } from "./SidebarProjectGroup";

interface SidebarGroupedListProps<T> {
  items: T[];
  groupByKey: (item: T) => string | undefined;
  getSortValue: (item: T, sortBy: SortBy) => number;
  getItemKey: (item: T) => string;
  organizeMode: OrganizeMode;
  sortBy: SortBy;
  expandedGroups: Record<string, boolean>;
  onToggleGroupExpanded: (groupKey: string) => void;
  renderItem: (item: T) => ReactNode;
  emptyMessage?: string;
}

export function SidebarGroupedList<T>({
  items,
  groupByKey,
  getSortValue,
  getItemKey,
  organizeMode,
  sortBy,
  expandedGroups,
  onToggleGroupExpanded,
  renderItem,
  emptyMessage = "No items",
}: SidebarGroupedListProps<T>) {
  // Process items based on organize mode
  const processedContent = useMemo(() => {
    if (items.length === 0) {
      return null;
    }

    if (organizeMode === "chronological") {
      // Flat sorted list
      return sortItems(items, sortBy, getSortValue);
    }

    // Group by project
    const groups = groupItems(items, groupByKey);
    const sortedGroups = sortGroupItems(groups, sortBy, getSortValue);
    return sortGroups(sortedGroups, sortBy, getSortValue);
  }, [items, organizeMode, sortBy, groupByKey, getSortValue]);

  if (!processedContent || (Array.isArray(processedContent) && processedContent.length === 0)) {
    return (
      <p className="pl-2 pr-3 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
        {emptyMessage}
      </p>
    );
  }

  // Chronological mode - flat list
  if (organizeMode === "chronological") {
    const flatItems = processedContent as T[];
    return (
      <div className="space-y-px">
        {flatItems.map((item) => (
          <div key={getItemKey(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  // By-project mode - grouped list
  const groups = processedContent as Array<{ groupKey: string; items: T[] }>;
  return (
    <div>
      {groups.map((group) => (
        <SidebarProjectGroup
          key={group.groupKey}
          groupKey={group.groupKey}
          items={group.items}
          isExpanded={expandedGroups[group.groupKey] ?? false}
          onToggleExpand={() => onToggleGroupExpanded(group.groupKey)}
          renderItem={(item) => (
            <div key={getItemKey(item)}>{renderItem(item)}</div>
          )}
        />
      ))}
    </div>
  );
}
