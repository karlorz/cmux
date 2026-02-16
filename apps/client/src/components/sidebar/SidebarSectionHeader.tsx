import { Link, type LinkProps } from "@tanstack/react-router";
import clsx from "clsx";
import type { ReactNode } from "react";
import { SidebarFilterMenu } from "./SidebarFilterMenu";
import type { OrganizeMode, SectionPreferences, ShowFilter, SortBy } from "./sidebar-types";

interface SidebarSectionHeaderProps {
  title: string;
  to: LinkProps["to"];
  teamSlugOrId: string;
  preferences: SectionPreferences;
  onOrganizeModeChange: (mode: OrganizeMode) => void;
  onSortByChange: (sort: SortBy) => void;
  onShowFilterChange: (filter: ShowFilter) => void;
  /** Optional trailing content (e.g., "+" button for Workspaces) */
  trailing?: ReactNode;
  className?: string;
  /** Data attribute for onboarding targeting */
  onboardingKey?: string;
}

export function SidebarSectionHeader({
  title,
  to,
  teamSlugOrId,
  preferences,
  onOrganizeModeChange,
  onSortByChange,
  onShowFilterChange,
  trailing,
  className,
  onboardingKey,
}: SidebarSectionHeaderProps) {
  // Cast params to the expected type for Link
  const params = { teamSlugOrId } as LinkProps["params"];

  return (
    <div
      className={clsx("flex items-center justify-between ml-2 pr-1", className)}
      {...(onboardingKey && { "data-onboarding": onboardingKey })}
    >
      <Link
        to={to}
        params={params}
        activeOptions={{ exact: true }}
        className={clsx(
          "pointer-default cursor-default flex items-center rounded-sm pl-2 pr-3 py-0.5 text-[12px] font-medium text-neutral-600 select-none hover:bg-neutral-200/45 dark:text-neutral-300 dark:hover:bg-neutral-800/45 data-[active=true]:hover:bg-neutral-200/75 dark:data-[active=true]:hover:bg-neutral-800/65"
        )}
        activeProps={{
          className:
            "bg-neutral-200/75 text-neutral-900 dark:bg-neutral-800/65 dark:text-neutral-100",
          "data-active": "true",
        }}
      >
        {title}
      </Link>
      <div className="flex items-center gap-0.5">
        {trailing}
        <SidebarFilterMenu
          preferences={preferences}
          onOrganizeModeChange={onOrganizeModeChange}
          onSortByChange={onSortByChange}
          onShowFilterChange={onShowFilterChange}
        />
      </div>
    </div>
  );
}
