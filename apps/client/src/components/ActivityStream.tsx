import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import {
  FileEdit,
  FileSearch,
  Terminal,
  GitCommit,
  AlertTriangle,
  Brain,
  Wrench,
} from "lucide-react";

const ACTIVITY_ICONS: Record<string, typeof FileEdit> = {
  file_edit: FileEdit,
  file_read: FileSearch,
  bash_command: Terminal,
  git_commit: GitCommit,
  error: AlertTriangle,
  thinking: Brain,
  test_run: Terminal,
  tool_call: Wrench,
};

const ACTIVITY_COLORS: Record<string, string> = {
  file_edit: "text-blue-500 dark:text-blue-400",
  file_read: "text-neutral-500 dark:text-neutral-400",
  bash_command: "text-green-600 dark:text-green-400",
  git_commit: "text-purple-500 dark:text-purple-400",
  error: "text-red-500 dark:text-red-400",
  thinking: "text-neutral-400 dark:text-neutral-500",
  test_run: "text-amber-500 dark:text-amber-400",
  tool_call: "text-neutral-500 dark:text-neutral-400",
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

interface ActivityStreamProps {
  taskRunId: Id<"taskRuns">;
}

export function ActivityStream({ taskRunId }: ActivityStreamProps) {
  const activities = useQuery(api.taskRunActivity.getByTaskRunAsc, {
    taskRunId,
    limit: 200,
  });
  const [pinToBottom, setPinToBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pinToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activities, pinToBottom]);

  if (!activities) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
        Loading activity...
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-500 dark:text-neutral-400">
        <Wrench className="h-8 w-8 opacity-50" />
        <p className="text-sm">No activity events yet</p>
        <p className="text-xs">Events will appear here as the agent works</p>
      </div>
    );
  }

  const editCount = activities.filter(
    (a) => a.type === "file_edit"
  ).length;
  const commandCount = activities.filter(
    (a) => a.type === "bash_command"
  ).length;
  const errorCount = activities.filter((a) => a.type === "error").length;

  return (
    <div className="flex flex-col h-full">
      {errorCount > 0 && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            {errorCount} error{errorCount > 1 ? "s" : ""} encountered
          </span>
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <span>{activities.length} events</span>
          {editCount > 0 && (
            <span className="text-blue-600 dark:text-blue-400">
              {editCount} file edit{editCount > 1 ? "s" : ""}
            </span>
          )}
          {commandCount > 0 && (
            <span className="text-green-600 dark:text-green-400">
              {commandCount} command{commandCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={() => setPinToBottom(!pinToBottom)}
          className={`text-xs px-2 py-0.5 rounded ${
            pinToBottom
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
          }`}
        >
          {pinToBottom ? "Auto-scroll ON" : "Auto-scroll OFF"}
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          if (!scrollRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
          if (isAtBottom !== pinToBottom) setPinToBottom(isAtBottom);
        }}
      >
        <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {activities.map((activity) => {
            const Icon =
              ACTIVITY_ICONS[activity.type] ?? Wrench;
            const colorClass =
              ACTIVITY_COLORS[activity.type] ?? "text-neutral-500";

            const isError = activity.type === "error";

            return (
              <div
                key={activity._id}
                className={`flex items-start gap-2 px-3 py-2 ${
                  isError
                    ? "bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                }`}
              >
                <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-800 dark:text-neutral-200 truncate">
                    {activity.summary}
                  </p>
                  {activity.toolName && activity.toolName !== activity.summary && (
                    <p className="text-xs text-neutral-400 dark:text-neutral-600">
                      {activity.toolName}
                    </p>
                  )}
                </div>
                <span className="text-xs text-neutral-400 dark:text-neutral-600 flex-shrink-0 whitespace-nowrap">
                  {formatRelativeTime(activity.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
