import { type Doc } from "@cmux/convex/dataModel";
import { ListBox, ListBoxItem } from "react-aria-components";
import { useQuery as useConvexQuery } from "convex/react";
import { api } from "@cmux/convex/api";
import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SidebarListItem } from "./SidebarListItem";
import { TaskTree } from "../TaskTree";
import { forwardRef, useImperativeHandle } from "react";

interface SidebarListboxProps {
  tasks: Doc<"tasks">[] | undefined;
  teamSlugOrId: string;
}

export interface SidebarListboxRef {
  focus: () => void;
}

interface ListboxItem {
  id: string;
  type: 'pr' | 'workspace';
  data: any;
}

export const SidebarListbox = forwardRef<SidebarListboxRef, SidebarListboxProps>(
  ({ tasks, teamSlugOrId }, ref) => {
    const prs = useConvexQuery(api.github_prs.listPullRequests, {
      teamSlugOrId,
      state: "open",
      limit: 50, // Use a reasonable limit for the listbox
    });

    // Collect all items for the listbox
    const items: ListboxItem[] = [];

    // Add PRs
    if (prs) {
      prs.forEach((pr) => {
        items.push({
          id: `pr-${pr.repoFullName}#${pr.number}`,
          type: 'pr',
          data: pr,
        });
      });
    }

    // Add workspaces/tasks
    if (tasks) {
      tasks.forEach((task) => {
        items.push({
          id: `workspace-${task._id}`,
          type: 'workspace',
          data: task,
        });
      });
    }

    useImperativeHandle(ref, () => ({
      focus: () => {
        // Focus the first item in the listbox
        const listbox = document.querySelector('[role="listbox"]') as HTMLElement;
        if (listbox) {
          const firstItem = listbox.querySelector('[role="option"]') as HTMLElement;
          if (firstItem) {
            firstItem.focus();
          }
        }
      },
    }));

    return (
      <ListBox
        aria-label="Sidebar navigation"
        className="flex flex-col gap-px"
        selectionMode="single"
        selectionBehavior="replace"
      >
      {/* Pull Requests Section Header */}
      <div className="mt-4 flex flex-col">
        <div className="ml-2 pt-px">
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Pull requests
          </div>
        </div>
      </div>

      {/* Pull Request Items */}
      {prs === undefined ? (
        <div className="ml-2 pt-px">
          <div className="px-2 py-1.5">
            <div className="h-3 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          </div>
        </div>
      ) : prs.length === 0 ? (
        <div className="ml-2 pt-px">
          <p className="pl-2 pr-3 py-2 text-xs text-neutral-500 dark:text-neutral-400 select-none">
            No pull requests
          </p>
        </div>
      ) : (
        prs.map((pr) => (
          <ListBoxItem
            key={`pr-${pr.repoFullName}#${pr.number}`}
            id={`pr-${pr.repoFullName}#${pr.number}`}
            className="focus:outline-none"
          >
            <PullRequestListItem pr={pr} teamSlugOrId={teamSlugOrId} />
          </ListBoxItem>
        ))
      )}

      {/* Workspaces Section Header */}
      <div className="mt-2 flex flex-col gap-0.5">
        <div className="ml-2 pt-px">
          <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Workspaces
          </div>
        </div>
      </div>

      {/* Workspace Items */}
      <div className="ml-2 pt-px">
        <div className="space-y-px">
          {tasks === undefined ? (
            <div className="px-2 py-1.5">
              <div className="h-3 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
            </div>
          ) : tasks && tasks.length > 0 ? (
            tasks.map((task) => (
              <ListBoxItem
                key={`workspace-${task._id}`}
                id={`workspace-${task._id}`}
                className="focus:outline-none"
              >
                <TaskTree
                  task={task}
                  defaultExpanded={false}
                  teamSlugOrId={teamSlugOrId}
                />
              </ListBoxItem>
            ))
          ) : (
            <p className="pl-2 pr-3 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 select-none">
              No recent tasks
            </p>
          )}
        </div>
      </div>
    </ListBox>
  );
});

function PullRequestListItem({ pr, teamSlugOrId }: { pr: Doc<"pullRequests">; teamSlugOrId: string }) {
  const [owner = "", repo = ""] = pr.repoFullName?.split("/", 2) ?? ["", ""];
  const branchLabel = pr.headRef;

  const secondaryParts = [
    branchLabel,
    `${pr.repoFullName}#${pr.number}`,
    pr.authorLogin,
  ]
    .filter(Boolean)
    .map(String);
  const secondary = secondaryParts.join(" • ");
  const leadingIcon = pr.merged ? (
    <GitMerge className="w-3 h-3 text-purple-500" />
  ) : pr.state === "closed" ? (
    <GitPullRequestClosed className="w-3 h-3 text-red-500" />
  ) : pr.draft ? (
    <GitPullRequestDraft className="w-3 h-3 text-neutral-500" />
  ) : (
    <GitPullRequest className="w-3 h-3 text-[#1f883d] dark:text-[#238636]" />
  );

  return (
    <li className="rounded-md select-none">
      <Link
        to="/$teamSlugOrId/prs-only/$owner/$repo/$number"
        params={{
          teamSlugOrId,
          owner,
          repo,
          number: String(pr.number),
        }}
        className="group block"
      >
        <SidebarListItem
          paddingLeft={10}
          title={pr.title}
          titleClassName="text-[13px] text-neutral-950 dark:text-neutral-100"
          secondary={secondary || undefined}
          meta={leadingIcon}
        />
      </Link>
    </li>
  );
}