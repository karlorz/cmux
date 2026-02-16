import { Check, ListFilter } from "lucide-react";
import type { CSSProperties } from "react";
import { DropdownParts as Dropdown } from "../ui/dropdown.parts";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import type {
  OrganizeMode,
  ShowFilter,
  SidebarPreferences,
  SortBy,
} from "./sidebar-types";

interface SidebarFilterMenuProps {
  preferences: Pick<SidebarPreferences, "organizeMode" | "sortBy" | "showFilter">;
  onOrganizeModeChange: (mode: OrganizeMode) => void;
  onSortByChange: (sortBy: SortBy) => void;
  onShowFilterChange: (showFilter: ShowFilter) => void;
}

interface FilterOptionProps {
  label: string;
  checked: boolean;
  onSelect: () => void;
}

function FilterOption({ label, checked, onSelect }: FilterOptionProps) {
  return (
    <Dropdown.CheckboxItem
      checked={checked}
      onCheckedChange={(nextChecked) => {
        if (nextChecked) {
          onSelect();
        }
      }}
    >
      <Dropdown.CheckboxItemIndicator>
        <Check className="w-3 h-3" />
      </Dropdown.CheckboxItemIndicator>
      <span className="col-start-2">{label}</span>
    </Dropdown.CheckboxItem>
  );
}

function MenuSection({ title }: { title: string }) {
  return (
    <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
      {title}
    </div>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />;
}

export function SidebarFilterMenu({
  preferences,
  onOrganizeModeChange,
  onSortByChange,
  onShowFilterChange,
}: SidebarFilterMenuProps) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger
        className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default"
        title="Filter, sort, and organize"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center justify-center">
              <ListFilter
                className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300"
                aria-hidden="true"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Filter, sort, and organize
          </TooltipContent>
        </Tooltip>
      </Dropdown.Trigger>

      <Dropdown.Portal>
        <Dropdown.Positioner sideOffset={6} side="bottom" align="end">
          <Dropdown.Popup className="min-w-[220px]">
            <MenuSection title="Organize" />
            <FilterOption
              label="By project"
              checked={preferences.organizeMode === "by-project"}
              onSelect={() => onOrganizeModeChange("by-project")}
            />
            <FilterOption
              label="Chronological list"
              checked={preferences.organizeMode === "chronological"}
              onSelect={() => onOrganizeModeChange("chronological")}
            />

            <MenuDivider />
            <MenuSection title="Sort by" />
            <FilterOption
              label="Created"
              checked={preferences.sortBy === "created"}
              onSelect={() => onSortByChange("created")}
            />
            <FilterOption
              label="Updated"
              checked={preferences.sortBy === "updated"}
              onSelect={() => onSortByChange("updated")}
            />

            <MenuDivider />
            <MenuSection title="Show" />
            <FilterOption
              label="All threads"
              checked={preferences.showFilter === "all"}
              onSelect={() => onShowFilterChange("all")}
            />
            <FilterOption
              label="Relevant"
              checked={preferences.showFilter === "relevant"}
              onSelect={() => onShowFilterChange("relevant")}
            />
          </Dropdown.Popup>
        </Dropdown.Positioner>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export default SidebarFilterMenu;
