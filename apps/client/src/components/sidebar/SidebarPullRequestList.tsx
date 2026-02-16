import { GitHubIcon } from "@/components/icons/github";
import { api } from "@cmux/convex/api";
import { Link } from "@tanstack/react-router";
import { useQuery as useConvexQuery } from "convex/react";
import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { SidebarListItem } from "./SidebarListItem";
import { SidebarProjectGroup } from "./SidebarProjectGroup";
import { SIDEBAR_PRS_DEFAULT_LIMIT } from "./const";
import type { Doc } from "@cmux/convex/dataModel";
import type { SectionPreferences, SortBy } from "./sidebar-types";
import {
  filterRelevant,
  getGroupDisplayName,
  groupItemsByProject,
  isItemRelevant,
  sortItems,
} from "./sidebar-utils";

type Props = {
  teamSlugOrId: string;
  limit?: number;
  preferences?: SectionPreferences;
  isGroupCollapsed?: (groupKey: string) => boolean;
  toggleGroupCollapsed?: (groupKey: string) => void;
  isGroupExpanded?: (groupKey: string) => boolean;
  toggleGroupExpanded?: (groupKey: string) => void;
};

export function SidebarPullRequestList({
  teamSlugOrId,
  limit = SIDEBAR_PRS_DEFAULT_LIMIT,
  preferences,
  isGroupCollapsed,
  toggleGroupCollapsed,
  isGroupExpanded,
  toggleGroupExpanded,
}: Props) {
  const prs = useConvexQuery(api.github_prs.listPullRequests, {
    teamSlugOrId,
    state: "open",
    limit,
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Process PRs with grouping/filtering/sorting if preferences are provided
  const processedPRs = useMemo(() => {
    if (!prs) return { groups: new Map<string, Doc<"pullRequests">[]>(), flat: [] };

    let prList = [...prs];

    if (preferences) {
      // Apply show filter
      prList = filterRelevant(
        prList,
        preferences.showFilter,
        (pr) => isItemRelevant(pr._creationTime, false)
      );

      // Apply sort
      prList = sortItems(prList, preferences.sortBy, (pr, sortBy: SortBy) => {
        if (sortBy === "updated") {
          return pr.updatedAt ?? pr._creationTime;
        }
        return pr._creationTime;
      });

      // Group by repo if in "by-project" mode
      if (preferences.organizeMode === "by-project") {
        const groups = groupItemsByProject(prList, (pr) => pr.repoFullName ?? undefined);
        return { groups, flat: [] };
      }
    }

    return { groups: new Map<string, Doc<"pullRequests">[]>(), flat: prList };
  }, [prs, preferences]);

  if (prs === undefined) {
    return (
      <ul className="flex flex-col gap-px" aria-label="Loading pull requests">
        {Array.from({ length: limit }).map((_, index) => (
          <li key={index} className="px-2 py-1.5">
            <div className="h-3 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          </li>
        ))}
      </ul>
    );
  }

  const hasNoPRs = processedPRs.groups.size === 0 && processedPRs.flat.length === 0;

  if (hasNoPRs) {
    return (
      <p className="mt-1 pl-2 pr-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 select-none">
        No pull requests
      </p>
    );
  }

  const renderPR = (pr: Doc<"pullRequests">) => (
    <PullRequestListItem
      key={`${pr.repoFullName}#${pr.number}`}
      pr={pr}
      teamSlugOrId={teamSlugOrId}
      expanded={expanded}
      setExpanded={setExpanded}
    />
  );

  // Grouped view
  if (preferences?.organizeMode === "by-project" && processedPRs.groups.size > 0 && isGroupCollapsed && toggleGroupCollapsed && isGroupExpanded && toggleGroupExpanded) {
    return (
      <div className="flex flex-col gap-px">
        {Array.from(processedPRs.groups.entries()).map(([groupKey, groupPRs]) => (
          <SidebarProjectGroup
            key={groupKey}
            groupKey={groupKey}
            displayName={getGroupDisplayName(groupKey)}
            items={groupPRs}
            isCollapsed={isGroupCollapsed(groupKey)}
            onToggleCollapse={() => toggleGroupCollapsed(groupKey)}
            isExpanded={isGroupExpanded(groupKey)}
            onToggleExpand={() => toggleGroupExpanded(groupKey)}
            renderItem={renderPR}
            initialDisplayCount={5}
          />
        ))}
      </div>
    );
  }

  // Flat list view
  return (
    <ul className="flex flex-col gap-px">
      {processedPRs.flat.map(renderPR)}
    </ul>
  );
}

type PullRequestListItemProps = {
  pr: Doc<"pullRequests">;
  teamSlugOrId: string;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
};

function PullRequestListItem({ pr, teamSlugOrId, expanded, setExpanded }: PullRequestListItemProps) {
  const [owner = "", repo = ""] = pr.repoFullName?.split("/", 2) ?? ["", ""];
  const key = `${pr.repoFullName}#${pr.number}`;
  const isExpanded = expanded[key] ?? false;
  const branchLabel = pr.headRef;

  const secondaryParts = [
    branchLabel,
    `${pr.repoFullName}#${pr.number}`,
    pr.authorLogin,
  ]
    .filter(Boolean)
    .map(String);
  const secondary = secondaryParts.join(" - ");
  const leadingIcon = pr.merged ? (
    <GitMerge className="w-3 h-3 text-purple-500" />
  ) : pr.state === "closed" ? (
    <GitPullRequestClosed className="w-3 h-3 text-red-500" />
  ) : pr.draft ? (
    <GitPullRequestDraft className="w-3 h-3 text-neutral-500" />
  ) : (
    <GitPullRequest className="w-3 h-3 text-[#1f883d] dark:text-[#238636]" />
  );

  const handleToggle = (
    _event?: MouseEvent<HTMLButtonElement | HTMLAnchorElement>
  ) => {
    setExpanded((prev) => ({
      ...prev,
      [key]: !isExpanded,
    }));
  };

  return (
    <li key={key} className="rounded-md select-none">
      <Link
        to="/$teamSlugOrId/prs-only/$owner/$repo/$number"
        params={{
          teamSlugOrId,
          owner,
          repo,
          number: String(pr.number),
        }}
        className="group block"
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          handleToggle(event);
        }}
      >
        <SidebarListItem
          paddingLeft={10}
          toggle={{
            expanded: isExpanded,
            onToggle: handleToggle,
            visible: true,
          }}
          title={pr.title}
          titleClassName="text-[13px] text-neutral-950 dark:text-neutral-100"
          secondary={secondary || undefined}
          meta={leadingIcon}
        />
      </Link>
      {isExpanded && pr.htmlUrl ? (
        <div className="mt-px flex flex-col" role="group">
          <a
            href={pr.htmlUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              event.stopPropagation();
            }}
            className="mt-px flex w-full items-center rounded-md pr-2 py-1 text-xs transition-colors hover:bg-neutral-200/45 dark:hover:bg-neutral-800/45"
            style={{ paddingLeft: "32px" }}
          >
            <GitHubIcon
              className="mr-2 h-3 w-3 text-neutral-400 grayscale opacity-60"
              aria-hidden
            />
            <span className="text-neutral-600 dark:text-neutral-400">
              GitHub
            </span>
          </a>
        </div>
      ) : null}
    </li>
  );
}

export default SidebarPullRequestList;
