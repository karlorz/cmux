import { type ReactNode } from "react";
import { SidebarListItem } from "./SidebarListItem";
import { formatSidebarGroupLabel } from "./sidebar-utils";

interface SidebarProjectGroupProps<T> {
  groupKey: string;
  items: T[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  renderItem: (item: T, index: number) => ReactNode;
  getItemKey: (item: T, index: number) => string;
  initialDisplayCount?: number;
}

export function SidebarProjectGroup<T>({
  groupKey,
  items,
  isExpanded,
  onToggleExpand,
  renderItem,
  getItemKey,
  initialDisplayCount = 5,
}: SidebarProjectGroupProps<T>) {
  const groupName = formatSidebarGroupLabel(groupKey);
  const visibleItems = isExpanded ? items : items.slice(0, initialDisplayCount);
  const hiddenCount = Math.max(items.length - visibleItems.length, 0);

  return (
    <section className="flex flex-col" aria-label={groupName}>
      <div className="px-2 pb-0.5 pt-1">
        <span className="truncate text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          {groupName}
        </span>
      </div>

      <div className="space-y-px">
        {visibleItems.map((item, index) => (
          <div key={getItemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>

      {items.length > initialDisplayCount ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full rounded-md text-left"
        >
          <SidebarListItem
            paddingLeft={10}
            title={isExpanded ? "Show less" : `Show more (${hiddenCount})`}
            titleClassName="text-[11px] font-medium text-neutral-500 dark:text-neutral-400"
            className="py-[2px]"
          />
        </button>
      ) : null}
    </section>
  );
}

export default SidebarProjectGroup;
