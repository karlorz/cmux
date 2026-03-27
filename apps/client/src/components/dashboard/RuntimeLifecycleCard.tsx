import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  RefreshCw,
} from "lucide-react";

interface RuntimeLifecycleCardProps {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
}

/**
 * RuntimeLifecycleCard displays the current interruption/lifecycle state
 * of a task run, including whether it can be resumed via provider-native
 * session continuation or checkpoint-based recovery.
 *
 * Issue #887: Operator-facing lifecycle visibility
 */
export function RuntimeLifecycleCard({
  taskRunId,
  teamSlugOrId,
}: RuntimeLifecycleCardProps) {
  const { data: state, isLoading } = useQuery({
    ...convexQuery(api.taskRuns.getInterruptionState, {
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

  if (!state) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <RefreshCw className="size-4" />
          <span className="text-sm">No lifecycle data</span>
        </div>
      </div>
    );
  }

  // Not interrupted - running normally
  if (!state.interrupted) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2">
          <Play className="size-4 text-green-600" />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Running
          </span>
          <CheckCircle2 className="size-4 text-green-600" />
        </div>
        {state.agentName && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {state.agentName}
          </p>
        )}
      </div>
    );
  }

  // Interrupted - show details
  const statusConfig = getStatusConfig(state.status);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pause className="size-4 text-amber-600" />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Runtime Lifecycle
          </span>
          {state.canResume && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <Play className="size-3" />
              Resumable
            </span>
          )}
        </div>
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            statusConfig.color
          )}
        >
          {statusConfig.label}
        </span>
      </div>

      {/* Details */}
      <div className="mt-3 space-y-2 text-xs">
        {/* Reason */}
        {state.reason && (
          <div className="flex items-start gap-2 text-neutral-600 dark:text-neutral-400">
            <span>Reason:</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {state.reason}
            </span>
          </div>
        )}

        {/* Resume method */}
        {state.canResume && (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span>Resume via:</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {getResumeMethod(state)}
            </span>
          </div>
        )}

        {/* Timestamps */}
        {state.blockedAt && (
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
            <Clock className="size-3.5" />
            <span>Blocked:</span>
            <span>{formatTimestamp(state.blockedAt)}</span>
          </div>
        )}
        {state.resolvedAt && (
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
            <CheckCircle2 className="size-3.5" />
            <span>Resolved:</span>
            <span>
              {formatTimestamp(state.resolvedAt)}
              {state.resolvedBy && ` by ${state.resolvedBy}`}
            </span>
          </div>
        )}
        {state.expiresAt && !state.resolvedAt && (
          <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
            <AlertCircle className="size-3.5" />
            <span>Expires:</span>
            <span>{formatTimestamp(state.expiresAt)}</span>
          </div>
        )}

        {/* Provider details */}
        {state.providerSessionId && (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span>Session:</span>
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {truncateId(state.providerSessionId)}
            </code>
          </div>
        )}
        {state.checkpointRef && (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span>Checkpoint:</span>
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {truncateId(state.checkpointRef)}
            </code>
            {state.checkpointGeneration && (
              <span className="text-neutral-500">(gen {state.checkpointGeneration})</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getStatusConfig(status: string): { label: string; color: string } {
  const configs: Record<string, { label: string; color: string }> = {
    none: {
      label: "Active",
      color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
    approval_pending: {
      label: "Awaiting Approval",
      color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    },
    checkpoint_pending: {
      label: "Checkpoint Pending",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    },
    handoff_pending: {
      label: "Handoff Pending",
      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    },
    paused: {
      label: "Paused",
      color: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    },
    blocked: {
      label: "Blocked",
      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
  };

  return configs[status] ?? {
    label: status,
    color: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  };
}

function getResumeMethod(state: {
  checkpointRef?: string;
  providerSessionId?: string;
  resumeToken?: string;
}): string {
  if (state.checkpointRef) {
    return "Checkpoint restore";
  }
  if (state.providerSessionId) {
    return "Provider session continuation";
  }
  if (state.resumeToken) {
    return "Resume token";
  }
  return "Unknown";
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateId(id: string, maxLen = 16): string {
  if (id.length <= maxLen) return id;
  return `${id.slice(0, maxLen)}...`;
}
