import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowRight,
  GitBranch,
  History,
  Play,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

interface LineageChainCardProps {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
}

/**
 * LineageChainCard displays the durable run-to-run ancestry from the
 * append-only runtimeLineage table. Shows whether a run is fresh,
 * continued, retried, or checkpoint-restored.
 *
 * Issue #890: Show durable runtime lineage in run detail
 */
export function LineageChainCard({
  taskRunId,
  teamSlugOrId,
}: LineageChainCardProps) {
  const { data: lineageData, isLoading } = useQuery({
    ...convexQuery(api.runtimeLineage.getLineageChain, {
      teamSlugOrId,
      taskRunId,
      maxDepth: 10,
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

  if (!lineageData || lineageData.chain.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <History className="size-4" />
          <span className="text-sm">No lineage recorded</span>
        </div>
        <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
          Run created before lineage tracking was enabled
        </p>
      </div>
    );
  }

  const { chain, reachedInitial, truncated } = lineageData;
  const currentEntry = chain[chain.length - 1];
  const isInitialRun = currentEntry?.continuationMode === "initial";

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-purple-600" />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Run Lineage
          </span>
          {isInitialRun ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <Play className="size-3" />
              Fresh
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              <RotateCcw className="size-3" />
              {getContinuationLabel(currentEntry?.continuationMode)}
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-500">
          {chain.length} run{chain.length !== 1 ? "s" : ""} in chain
        </span>
      </div>

      {/* Chain visualization */}
      {chain.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {truncated && (
            <>
              <span className="text-xs text-neutral-400">...</span>
              <ArrowRight className="size-3 text-neutral-400" />
            </>
          )}
          {chain.map((entry, index) => {
            const isCurrent = entry.taskRunId === taskRunId;
            const isFirst = index === 0 && reachedInitial;

            return (
              <div key={entry.taskRunId} className="flex items-center gap-1">
                {index > 0 && (
                  <ArrowRight className="size-3 text-neutral-400" />
                )}
                <div
                  className={clsx(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs",
                    isCurrent
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  )}
                  title={`${getContinuationLabel(entry.continuationMode)} - ${formatTimestamp(entry.createdAt)}`}
                >
                  {getModeIcon(entry.continuationMode)}
                  <span className="font-mono">
                    {truncateRunId(entry.taskRunId)}
                  </span>
                  {isCurrent && <span className="font-medium">(current)</span>}
                  {isFirst && !isCurrent && (
                    <span className="text-green-600 dark:text-green-400">
                      (initial)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Current run details */}
      <div className="mt-3 space-y-1 border-t border-neutral-200 pt-2 text-xs dark:border-neutral-800">
        <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
          <span>Mode:</span>
          <span className="font-medium text-neutral-800 dark:text-neutral-200">
            {getContinuationLabel(currentEntry?.continuationMode)}
          </span>
        </div>
        {currentEntry?.resumeReason && (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span>Reason:</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {currentEntry.resumeReason}
            </span>
          </div>
        )}
        {currentEntry?.actor && (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span>Initiated by:</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {currentEntry.actor}
            </span>
          </div>
        )}
        {currentEntry?.agentName && (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span>Agent:</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {currentEntry.agentName}
            </span>
          </div>
        )}
        {currentEntry?.previousTaskRunId && (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span>Continues from:</span>
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {truncateRunId(currentEntry.previousTaskRunId)}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

function getContinuationLabel(mode?: string): string {
  const labels: Record<string, string> = {
    initial: "Fresh run",
    retry: "Retry",
    manual_resume: "Manual resume",
    checkpoint_restore: "Checkpoint restore",
    session_continuation: "Session continuation",
    handoff: "Handoff",
    reconnect: "Reconnect",
  };
  return labels[mode ?? ""] ?? mode ?? "Unknown";
}

function getModeIcon(mode?: string) {
  switch (mode) {
    case "initial":
      return <Play className="size-3" />;
    case "retry":
    case "reconnect":
      return <RefreshCw className="size-3" />;
    case "checkpoint_restore":
    case "session_continuation":
    case "manual_resume":
      return <RotateCcw className="size-3" />;
    case "handoff":
      return <ArrowRight className="size-3" />;
    default:
      return <History className="size-3" />;
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateRunId(id: string, maxLen = 8): string {
  if (id.length <= maxLen) return id;
  return id.slice(-maxLen);
}
