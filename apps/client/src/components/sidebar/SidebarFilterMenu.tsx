import { Menu } from "@base-ui-components/react/menu";
import clsx from "clsx";
import { Check, ListFilter, MoreHorizontal } from "lucide-react";
import type { OrganizeMode, SectionPreferences, ShowFilter, SortBy } from "./sidebar-types";

interface SidebarFilterMenuProps {
  preferences: SectionPreferences;
  onOrganizeModeChange: (mode: OrganizeMode) => void;
  onSortByChange: (sort: SortBy) => void;
  onShowFilterChange: (filter: ShowFilter) => void;
}

const radioItemClassName = clsx(
  "grid cursor-default grid-cols-[0.75rem_1fr] items-center gap-2 py-1.5 pr-6 pl-2.5 text-xs leading-4 outline-none select-none",
  "data-[highlighted]:relative data-[highlighted]:z-0",
  "data-[highlighted]:text-neutral-900 dark:data-[highlighted]:text-neutral-100",
  "data-[highlighted]:before:absolute data-[highlighted]:before:inset-x-1 data-[highlighted]:before:inset-y-0",
  "data-[highlighted]:before:z-[-1] data-[highlighted]:before:rounded-sm",
  "data-[highlighted]:before:bg-neutral-100 dark:data-[highlighted]:before:bg-neutral-800"
);

const labelClassName = "px-2.5 py-1.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-500 uppercase tracking-wide";

const popupClassName = clsx(
  "origin-[var(--transform-origin)] rounded-md bg-white dark:bg-black py-1 min-w-[160px]",
  "text-neutral-900 dark:text-neutral-100",
  "shadow-lg shadow-neutral-200 dark:shadow-neutral-950",
  "outline outline-neutral-200 dark:outline-neutral-800",
  "transition-[transform,scale,opacity]",
  "data-[ending-style]:scale-90 data-[ending-style]:opacity-0",
  "data-[starting-style]:scale-90 data-[starting-style]:opacity-0"
);

const iconButtonClassName = clsx(
  "p-1 flex items-center justify-center rounded",
  "text-neutral-500 dark:text-neutral-400",
  "hover:text-neutral-700 dark:hover:text-neutral-200",
  "hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50",
  "transition-colors"
);

export function SidebarFilterMenu({
  preferences,
  onOrganizeModeChange,
  onSortByChange,
  onShowFilterChange,
}: SidebarFilterMenuProps) {
  return (
    <div className="flex items-center gap-0.5">
      {/* Filter icon - Show filter options */}
      <Menu.Root>
        <Menu.Trigger
          className={iconButtonClassName}
          title="Filter"
        >
          <ListFilter className="w-3.5 h-3.5" aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} side="bottom" align="end" className="outline-none z-[var(--z-popover)]">
            <Menu.Popup className={popupClassName}>
              <div className={labelClassName}>Show</div>
              <Menu.RadioGroup
                value={preferences.showFilter}
                onValueChange={(val) => onShowFilterChange(val as ShowFilter)}
              >
                <Menu.RadioItem value="all" className={radioItemClassName}>
                  <Menu.RadioItemIndicator className="col-start-1">
                    <Check className="w-3 h-3" />
                  </Menu.RadioItemIndicator>
                  <span className="col-start-2">All threads</span>
                </Menu.RadioItem>
                <Menu.RadioItem value="relevant" className={radioItemClassName}>
                  <Menu.RadioItemIndicator className="col-start-1">
                    <Check className="w-3 h-3" />
                  </Menu.RadioItemIndicator>
                  <span className="col-start-2">Relevant</span>
                </Menu.RadioItem>
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* Organize icon - Organize and sort options */}
      <Menu.Root>
        <Menu.Trigger
          className={iconButtonClassName}
          title="Organize"
        >
          <MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner sideOffset={4} side="bottom" align="end" className="outline-none z-[var(--z-popover)]">
            <Menu.Popup className={popupClassName}>
              <div className={labelClassName}>Organize</div>
              <Menu.RadioGroup
                value={preferences.organizeMode}
                onValueChange={(val) => onOrganizeModeChange(val as OrganizeMode)}
              >
                <Menu.RadioItem value="by-project" className={radioItemClassName}>
                  <Menu.RadioItemIndicator className="col-start-1">
                    <Check className="w-3 h-3" />
                  </Menu.RadioItemIndicator>
                  <span className="col-start-2">By project</span>
                </Menu.RadioItem>
                <Menu.RadioItem value="chronological" className={radioItemClassName}>
                  <Menu.RadioItemIndicator className="col-start-1">
                    <Check className="w-3 h-3" />
                  </Menu.RadioItemIndicator>
                  <span className="col-start-2">Chronological list</span>
                </Menu.RadioItem>
              </Menu.RadioGroup>

              <div className="my-1 mx-2 border-t border-neutral-200 dark:border-neutral-800" />

              <div className={labelClassName}>Sort by</div>
              <Menu.RadioGroup
                value={preferences.sortBy}
                onValueChange={(val) => onSortByChange(val as SortBy)}
              >
                <Menu.RadioItem value="created" className={radioItemClassName}>
                  <Menu.RadioItemIndicator className="col-start-1">
                    <Check className="w-3 h-3" />
                  </Menu.RadioItemIndicator>
                  <span className="col-start-2">Created</span>
                </Menu.RadioItem>
                <Menu.RadioItem value="updated" className={radioItemClassName}>
                  <Menu.RadioItemIndicator className="col-start-1">
                    <Check className="w-3 h-3" />
                  </Menu.RadioItemIndicator>
                  <span className="col-start-2">Updated</span>
                </Menu.RadioItem>
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
