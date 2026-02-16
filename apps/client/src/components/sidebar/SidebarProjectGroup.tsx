import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { ITEMS_PER_GROUP_COLLAPSED } from "./sidebar-types";
import { getGroupDisplayName } from "./sidebar-utils";

interface SidebarProjectGroupProps<T> {
  groupKey: string;
  items: T[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  renderItem: (item: T, index: number) => ReactNode;
  initialDisplayCount?: number;
}

export function SidebarProjectGroup<T>({
  groupKey,
  items,
  isExpanded,
  onToggleExpand,
  renderItem,
  initialDisplayCount = ITEMS_PER_GROUP_COLLAPSED,
}: SidebarProjectGroupProps<T>) {
  const displayName = getGroupDisplayName(groupKey);
  const hasMore = items.length > initialDisplayCount;
  const visibleItems = isExpanded ? items : items.slice(0, initialDisplayCount);
  const hiddenCount = items.length - initialDisplayCount;

  return (
    <div className="mb-1">
      {/* Group header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-1 px-2 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-sm transition-colors cursor-default"
      >
        {hasMore ? (
          isExpanded ? (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
          )
        ) : (
          <div className="w-3 h-3" />
        )}
        <span className="truncate">{displayName}</span>
        <span className="ml-auto text-neutral-400 dark:text-neutral-500">
          {items.length}
        </span>
      </button>

      {/* Items */}
      <div className="space-y-px">
        {visibleItems.map((item, index) => renderItem(item, index))}
      </div>

      {/* Show more/less button */}
      {hasMore && (
        <button
          onClick={onToggleExpand}
          className="w-full flex items-center px-2 py-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-sm transition-colors cursor-default"
          style={{ paddingLeft: "28px" }}
        >
          {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
