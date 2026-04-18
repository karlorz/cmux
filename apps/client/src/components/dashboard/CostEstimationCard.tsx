import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { memo } from "react";
import {
  AlertTriangle,
  Clock,
  Cpu,
  DollarSign,
  RefreshCw,
  Zap,
} from "lucide-react";

type CostEstimationCardProps = {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
};

// Estimated costs per minute of compute for different providers
// These are rough estimates - actual costs vary by model and token usage
const ESTIMATED_COST_PER_MINUTE: Record<string, number> = {
  // Anthropic Claude models (based on typical token usage patterns)
  "claude/opus-4.7": 0.15,
  "claude/opus-4.5": 0.15,
  "claude/opus-4.6": 0.15,
  "claude/sonnet-4.5": 0.03,
  "claude/sonnet-4.6": 0.03,
  "claude/haiku-4.5": 0.005,
  "claude/gpt-5.1-codex-mini": 0.02,
  // OpenAI Codex models
  "codex/gpt-5.4-xhigh": 0.12,
  "codex/gpt-5.1-codex-mini": 0.02,
  "codex/gpt-5.1-codex": 0.06,
  // Default for unknown models
  default: 0.05,
};

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

function CostEstimationCardSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-4 w-4 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="space-y-2">
        <div className="h-8 w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-4 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
    </div>
  );
}

export const CostEstimationCard = memo(function CostEstimationCard({
  taskRunId,
  teamSlugOrId,
}: CostEstimationCardProps) {
  const taskRunQuery = useQuery(
    convexQuery(api.taskRuns.get, { id: taskRunId, teamSlugOrId }),
  );

  if (taskRunQuery.isLoading) {
    return <CostEstimationCardSkeleton />;
  }

  if (taskRunQuery.isError) {
    const message =
      taskRunQuery.error?.message ?? "Failed to load cost estimate";
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                Failed to load cost estimate
              </p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void taskRunQuery.refetch();
            }}
            className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const taskRun = taskRunQuery.data;
  if (!taskRun) {
    return null;
  }

  // Calculate duration
  const startTime = taskRun.createdAt;
  const endTime = taskRun.completedAt ?? Date.now();
  const durationMs = endTime - startTime;
  const durationMinutes = durationMs / 60000;

  // Get cost rate for the model
  const agentName = taskRun.agentName ?? "default";
  const costPerMinute =
    ESTIMATED_COST_PER_MINUTE[agentName] ?? ESTIMATED_COST_PER_MINUTE.default;

  // Estimate cost
  const estimatedCost = durationMinutes * costPerMinute;

  // Status badge color
  const isRunning = taskRun.status === "running";

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="size-4 text-neutral-500 dark:text-neutral-400" />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Cost Estimation
          </span>
        </div>
        {isRunning && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            Running
          </span>
        )}
      </div>

      {/* Estimated cost */}
      <div className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
        {formatCost(estimatedCost)}
        <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400 ml-1">
          estimated
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-xs text-neutral-600 dark:text-neutral-400">
        <div className="flex items-center gap-2">
          <Clock className="size-3.5" />
          <span>Duration: {formatDuration(durationMs)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="size-3.5" />
          <span>Model: {agentName}</span>
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="size-3.5" />
          <span>Rate: {formatCost(costPerMinute)}/min</span>
        </div>
        {taskRun.contextUsage && (
          <div className="flex items-center gap-2">
            <Zap
              className={
                taskRun.contextUsage.usagePercent !== undefined &&
                taskRun.contextUsage.usagePercent >= 80
                  ? "size-3.5 text-amber-500"
                  : "size-3.5"
              }
            />
            <span>
              Tokens: {formatTokenCount(taskRun.contextUsage.totalInputTokens)}{" "}
              in / {formatTokenCount(taskRun.contextUsage.totalOutputTokens)}{" "}
              out
              {taskRun.contextUsage.usagePercent !== undefined && (
                <span
                  className={
                    taskRun.contextUsage.usagePercent >= 80
                      ? "ml-1 text-amber-500 font-medium"
                      : "ml-1 text-neutral-400 dark:text-neutral-500"
                  }
                >
                  ({taskRun.contextUsage.usagePercent}% context)
                </span>
              )}
            </span>
          </div>
        )}
        {taskRun.contextUsage?.usagePercent !== undefined &&
          taskRun.contextUsage.usagePercent >= 80 && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5" />
              <span className="font-medium">
                Context window{" "}
                {taskRun.contextUsage.usagePercent >= 95
                  ? "nearly full"
                  : "filling up"}
              </span>
            </div>
          )}
      </div>

      {/* Disclaimer */}
      <p className="mt-3 text-[10px] text-neutral-400 dark:text-neutral-500 leading-tight">
        Cost estimate based on compute time. Actual API costs depend on token
        usage and may vary.
      </p>
    </div>
  );
});
