import { Doc } from "@cmux/convex/dataModel";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  GitBranch,
  GitPullRequest,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TaskCardProps {
  task: Doc<"tasks">;
  teamSlugOrId: string;
}

export function TaskCard({ task, teamSlugOrId }: TaskCardProps) {

  const getMergeStatusBadge = () => {
    switch (task.mergeStatus) {
      case "pr_draft":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-600 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
            <GitPullRequest className="h-3 w-3" />
            Draft
          </span>
        );
      case "pr_open":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-600 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
            <GitPullRequest className="h-3 w-3" />
            Open
          </span>
        );
      case "pr_approved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-600 bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            Approved
          </span>
        );
      case "pr_merged":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-600 bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400">
            <CheckCircle2 className="h-3 w-3" />
            Merged
          </span>
        );
      case "pr_closed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-600 bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
            <Circle className="h-3 w-3" />
            Closed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <Link
      href={`/${teamSlugOrId}/task/${task._id}`}
      className="group block rounded-xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/10"
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-1">
            <h3 className="text-base font-semibold text-white group-hover:text-sky-400 transition">
              {task.text}
            </h3>
            {task.description && (
              <p className="text-sm text-neutral-400 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          {task.isCompleted ? (
            <CheckCircle2 className="h-5 w-5 flex-none text-green-500" />
          ) : (
            <Clock className="h-5 w-5 flex-none text-blue-500 animate-pulse" />
          )}
        </div>

        {/* Meta information */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          {task.projectFullName && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              <GitBranch className="h-3 w-3" />
              {task.projectFullName}
            </span>
          )}
          {task.baseBranch && task.baseBranch !== "main" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              {task.baseBranch}
            </span>
          )}
          {getMergeStatusBadge()}
        </div>

        {/* Timestamp */}
        {task.createdAt && (
          <p className="text-xs text-neutral-500">
            Created {formatDistanceToNow(task.createdAt, { addSuffix: true })}
          </p>
        )}
      </div>
    </Link>
  );
}
