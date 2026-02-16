import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { OTHER_GROUP_KEY } from "./sidebar-types";

interface SidebarProjectGroupProps<T> {
  groupKey: string;
  displayName: string;
  items: T[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** Number of items to show initially before "Show more" (default: 5) */
  initialDisplayCount?: number;
  className?: string;
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
  initialDisplayCount = 5,
  className,
}: SidebarProjectGroupProps<T>) {
  const isOtherGroup = groupKey === OTHER_GROUP_KEY;
  const visibleItems = isExpanded ? items : items.slice(0, initialDisplayCount);
  const remainingCount = items.length - initialDisplayCount;
  const showExpandButton = !isExpanded && remainingCount > 0;

  return (
    <div className={clsx("flex flex-col", className)}>
      {/* Group header with chevron */}
      <button
        onClick={onToggleCollapse}
        className={clsx(
          "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-sm",
          "text-neutral-600 dark:text-neutral-400",
          "hover:bg-neutral-200/45 dark:hover:bg-neutral-800/45",
          "cursor-default select-none transition-colors"
        )}
      >
        <ChevronRight
          className={clsx(
            "w-3 h-3 transition-transform",
            !isCollapsed && "rotate-90"
          )}
          aria-hidden="true"
        />
        <span className={clsx(isOtherGroup && "italic")}>{displayName}</span>
        <span className="text-neutral-400 dark:text-neutral-500 ml-1">
          ({items.length})
        </span>
      </button>

      {/* Group items */}
      {!isCollapsed && (
        <div className="flex flex-col">
          {visibleItems.map((item, index) => renderItem(item, index))}

          {/* Show more button */}
          {showExpandButton && (
            <button
              onClick={onToggleExpand}
              className={clsx(
                "ml-5 px-2 py-1 text-xs rounded-sm text-left",
                "text-neutral-500 dark:text-neutral-500",
                "hover:text-neutral-700 dark:hover:text-neutral-300",
                "hover:bg-neutral-200/45 dark:hover:bg-neutral-800/45",
                "cursor-default select-none transition-colors"
              )}
            >
              Show more ({remainingCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
