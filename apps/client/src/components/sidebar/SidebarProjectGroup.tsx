import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface SidebarProjectGroupProps<T> {
  groupKey: string;
  displayName: string;
  items: T[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  renderItem: (item: T) => ReactNode;
  getItemKey?: (item: T, index: number) => string;
  initialDisplayCount?: number;
}

export function SidebarProjectGroup<T>({
  groupKey,
  displayName,
  items,
  isCollapsed,
  onToggleCollapse,
  isExpanded,
  onToggleExpand,
  renderItem,
  getItemKey,
  initialDisplayCount = 5,
}: SidebarProjectGroupProps<T>) {
  const hasOverflow = items.length > initialDisplayCount;
  const visibleItems =
    hasOverflow && !isExpanded ? items.slice(0, initialDisplayCount) : items;
  const remainingCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div className="space-y-px" data-group-key={groupKey}>
      <button
        type="button"
        onClick={onToggleCollapse}
        className={clsx(
          "ml-2 flex w-[calc(100%-16px)] items-center gap-1 rounded-sm px-1.5 py-0.5 text-left text-[11px] font-medium",
          "text-neutral-500 hover:bg-neutral-200/45 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/45 dark:hover:text-neutral-200"
        )}
      >
        <ChevronRight
          className={clsx(
            "h-3 w-3 shrink-0 transition-transform",
            !isCollapsed && "rotate-90"
          )}
          aria-hidden="true"
        />
        <span className="truncate">{displayName}</span>
      </button>

      {!isCollapsed ? (
        <div className="space-y-px">
          {visibleItems.map((item, index) => (
            <div key={getItemKey ? getItemKey(item, index) : `${groupKey}-${index}`}>
              {renderItem(item)}
            </div>
          ))}

          {hasOverflow ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="ml-2 w-[calc(100%-16px)] rounded-sm px-2 py-0.5 text-left text-[11px] text-neutral-500 hover:bg-neutral-200/45 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800/45 dark:hover:text-neutral-200"
            >
              {isExpanded ? "Show less" : `Show more (${remainingCount})`}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
