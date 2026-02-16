import { DropdownParts } from "@/components/ui/dropdown.parts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, ListFilter } from "lucide-react";
import { forwardRef, type CSSProperties } from "react";
import type { OrganizeMode, ShowFilter, SortBy } from "./sidebar-types";

interface SidebarFilterMenuProps {
  organizeMode: OrganizeMode;
  sortBy: SortBy;
  showFilter: ShowFilter;
  onOrganizeModeChange: (mode: OrganizeMode) => void;
  onSortByChange: (sortBy: SortBy) => void;
  onShowFilterChange: (filter: ShowFilter) => void;
}

interface RadioItemProps {
  checked: boolean;
  onCheckedChange: () => void;
  children: React.ReactNode;
}

function RadioItem({ checked, onCheckedChange, children }: RadioItemProps) {
  return (
    <DropdownParts.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      closeOnClick={false}
    >
      <DropdownParts.CheckboxItemIndicator>
        {checked && <Check className="h-3 w-3" />}
      </DropdownParts.CheckboxItemIndicator>
      <span>{children}</span>
    </DropdownParts.CheckboxItem>
  );
}

// Forward ref button component for Tooltip + Dropdown composition
const FilterButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function FilterButton(props, ref) {
  return (
    <button
      ref={ref}
      {...props}
      className="w-[25px] h-[25px] flex items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
      style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
    >
      <ListFilter
        className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
        aria-hidden="true"
      />
    </button>
  );
});

export function SidebarFilterMenu({
  organizeMode,
  sortBy,
  showFilter,
  onOrganizeModeChange,
  onSortByChange,
  onShowFilterChange,
}: SidebarFilterMenuProps) {
  return (
    <DropdownParts.Root>
      <Tooltip>
        <DropdownParts.Trigger
          render={(props) => (
            <TooltipTrigger asChild>
              <FilterButton {...props} />
            </TooltipTrigger>
          )}
        />
        <TooltipContent side="bottom" sideOffset={4}>
          Filter, sort, and organize
        </TooltipContent>
      </Tooltip>
      <DropdownParts.Portal>
        <DropdownParts.Positioner align="end" sideOffset={4}>
          <DropdownParts.Popup className="min-w-[180px]">
            {/* Organize section */}
            <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Organize
            </div>
            <RadioItem
              checked={organizeMode === "by-project"}
              onCheckedChange={() => onOrganizeModeChange("by-project")}
            >
              By project
            </RadioItem>
            <RadioItem
              checked={organizeMode === "chronological"}
              onCheckedChange={() => onOrganizeModeChange("chronological")}
            >
              Chronological list
            </RadioItem>

            <div className="my-1 mx-2 border-t border-neutral-200 dark:border-neutral-800" />

            {/* Sort by section */}
            <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Sort by
            </div>
            <RadioItem
              checked={sortBy === "created"}
              onCheckedChange={() => onSortByChange("created")}
            >
              Created
            </RadioItem>
            <RadioItem
              checked={sortBy === "updated"}
              onCheckedChange={() => onSortByChange("updated")}
            >
              Updated
            </RadioItem>

            <div className="my-1 mx-2 border-t border-neutral-200 dark:border-neutral-800" />

            {/* Show section */}
            <div className="px-3 py-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Show
            </div>
            <RadioItem
              checked={showFilter === "all"}
              onCheckedChange={() => onShowFilterChange("all")}
            >
              All threads
            </RadioItem>
            <RadioItem
              checked={showFilter === "relevant"}
              onCheckedChange={() => onShowFilterChange("relevant")}
            >
              Relevant
            </RadioItem>
          </DropdownParts.Popup>
        </DropdownParts.Positioner>
      </DropdownParts.Portal>
    </DropdownParts.Root>
  );
}
