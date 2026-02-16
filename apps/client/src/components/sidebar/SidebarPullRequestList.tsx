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
import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { SidebarGroupedList } from "./SidebarGroupedList";
import { SidebarListItem } from "./SidebarListItem";
import { SIDEBAR_PRS_DEFAULT_LIMIT } from "./const";
import type { OrganizeMode, ShowFilter, SortBy } from "./sidebar-types";
import { filterRelevant } from "./sidebar-utils";
import type { Doc } from "@cmux/convex/dataModel";

type Props = {
  teamSlugOrId: string;
  limit?: number;
  organizeMode: OrganizeMode;
  sortBy: SortBy;
  showFilter: ShowFilter;
  expandedGroups: Record<string, boolean>;
  onToggleGroupExpanded: (groupKey: string) => void;
};

export function SidebarPullRequestList({
  teamSlugOrId,
  limit = SIDEBAR_PRS_DEFAULT_LIMIT,
  organizeMode,
  sortBy,
  showFilter,
  expandedGroups,
  onToggleGroupExpanded,
}: Props) {
  const prs = useConvexQuery(api.github_prs.listPullRequests, {
    teamSlugOrId,
    state: "open",
    limit,
  });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Filter PRs based on show filter setting
  const filteredPrs = useMemo(() => {
    if (!prs) return undefined;

    return filterRelevant(prs, showFilter, (pr) => ({
      hasUnread: false, // PRs don't have unread state currently
      lastActivityTime: pr._creationTime,
    }));
  }, [prs, showFilter]);

  // Grouping helpers
  const getPrGroupKey = useCallback((pr: Doc<"pullRequests">) => {
    return pr.repoFullName ?? undefined;
  }, []);

  const getPrSortValue = useCallback(
    (pr: Doc<"pullRequests">, sortBy: SortBy) => {
      if (sortBy === "updated") {
        return pr._creationTime;
      }
      return pr._creationTime;
    },
    []
  );

  const getPrKey = useCallback((pr: Doc<"pullRequests">) => {
    return `${pr.repoFullName}#${pr.number}`;
  }, []);

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

  if (filteredPrs && filteredPrs.length === 0) {
    return (
      <p className="mt-1 pl-2 pr-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 select-none">
        No pull requests
      </p>
    );
  }

  return (
    <SidebarGroupedList
      items={filteredPrs ?? []}
      groupByKey={getPrGroupKey}
      getSortValue={getPrSortValue}
      getItemKey={getPrKey}
      organizeMode={organizeMode}
      sortBy={sortBy}
      expandedGroups={expandedGroups}
      onToggleGroupExpanded={onToggleGroupExpanded}
      renderItem={(pr) => (
        <PullRequestListItem
          pr={pr}
          teamSlugOrId={teamSlugOrId}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
      emptyMessage="No pull requests"
    />
  );
}

type PullRequestListItemProps = {
  pr: Doc<"pullRequests">;
  teamSlugOrId: string;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
};

function PullRequestListItem({
  pr,
  teamSlugOrId,
  expanded,
  setExpanded,
}: PullRequestListItemProps) {
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
    <div className="rounded-md select-none">
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
    </div>
  );
}

export default SidebarPullRequestList;
