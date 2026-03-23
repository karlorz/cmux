import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Clock,
  Link2,
  MessageSquare,
  RotateCcw,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import clsx from "clsx";

interface SessionBindingCardProps {
  teamSlugOrId: string;
  taskRunId: Id<"taskRuns">;
}

/**
 * Displays provider session binding and resume ancestry info.
 * Shows whether the run has a bound provider session and if it's a resumed session.
 */
export function SessionBindingCard({
  teamSlugOrId,
  taskRunId,
}: SessionBindingCardProps) {
  const { data: ancestry, isLoading } = useQuery({
    ...convexQuery(api.providerSessions.getResumeAncestry, {
      teamSlugOrId,
      taskRunId,
    }),
    enabled: Boolean(teamSlugOrId && taskRunId),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <div className="size-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-4 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
        </div>
      </div>
    );
  }

  if (!ancestry?.hasBoundSession) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <Link2 className="size-4" />
          <span className="text-sm">No session binding</span>
        </div>
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
          Session bindings enable resume across retries
        </p>
      </div>
    );
  }

  const providerIcon = getProviderIcon(ancestry.provider);
  const statusColor = getStatusColor(ancestry.status);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {providerIcon}
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {ancestry.provider ? capitalizeFirst(ancestry.provider) : "Unknown"} Session
          </span>
          {ancestry.isResumedSession && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <RotateCcw className="size-3" />
              Resumed
            </span>
          )}
        </div>
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            statusColor
          )}
        >
          <Zap className="size-3" />
          {ancestry.status}
        </span>
      </div>

      {/* Details */}
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        {/* Mode */}
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
          <User className="size-3.5" />
          <span>Mode:</span>
          <span className="font-medium text-neutral-800 dark:text-neutral-200">
            {ancestry.mode ?? "unknown"}
          </span>
        </div>

        {/* Reply channel */}
        {ancestry.replyChannel && (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <MessageSquare className="size-3.5" />
            <span>Channel:</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {ancestry.replyChannel}
            </span>
          </div>
        )}

        {/* Session ID */}
        {ancestry.providerSessionId && (
          <div className="col-span-2 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <Terminal className="size-3.5" />
            <span>Session:</span>
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {truncateId(ancestry.providerSessionId)}
            </code>
          </div>
        )}

        {/* Thread ID (Codex) */}
        {ancestry.providerThreadId && (
          <div className="col-span-2 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <Activity className="size-3.5" />
            <span>Thread:</span>
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {truncateId(ancestry.providerThreadId)}
            </code>
          </div>
        )}

        {/* Timestamps */}
        {ancestry.createdAt && (
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
            <Clock className="size-3.5" />
            <span>Bound:</span>
            <span>{new Date(ancestry.createdAt).toLocaleString()}</span>
          </div>
        )}

        {ancestry.lastActiveAt && (
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
            <Clock className="size-3.5" />
            <span>Active:</span>
            <span>{new Date(ancestry.lastActiveAt).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getProviderIcon(provider: string | null) {
  const className = "size-4 text-neutral-600 dark:text-neutral-400";
  switch (provider) {
    case "claude":
      return <span className={clsx(className, "font-bold text-orange-600")}>C</span>;
    case "codex":
      return <span className={clsx(className, "font-bold text-green-600")}>X</span>;
    case "gemini":
      return <span className={clsx(className, "font-bold text-blue-600")}>G</span>;
    default:
      return <Terminal className={className} />;
  }
}

function getStatusColor(status: string | null) {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "suspended":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "expired":
      return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
    case "terminated":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  }
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncateId(id: string, maxLen = 24): string {
  if (id.length <= maxLen) return id;
  return `${id.slice(0, 12)}...${id.slice(-8)}`;
}
