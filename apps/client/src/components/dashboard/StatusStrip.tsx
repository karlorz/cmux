/**
 * StatusStrip - Compact operator status bar for run detail
 *
 * Surfaces essential run state in a persistent, always-visible strip:
 * - Lifecycle status (active, interrupted, completed, failed)
 * - Trust mode (approval pending, paused, etc.)
 * - Context health (token usage, warnings)
 * - Branch
 * - Provider/model
 * - Event freshness (time since last update)
 *
 * Implements issue #960 acceptance criteria:
 * - Operators see trust and health state without opening multiple cards
 * - Event freshness visible at all times
 * - Branch and provider available without leaving run detail
 */

import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import type { RunControlSummary } from "@cmux/shared";
import { getApiV1CmuxOrchestrationRunControlByTaskRunIdOptions } from "@cmux/www-openapi-client/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  GitBranch,
  Pause,
  Play,
  Server,
  Shield,
} from "lucide-react";
import { useMemo } from "react";

interface StatusStripProps {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
  branch?: string;
}

type ContextHealthData = {
  usagePercent?: number;
  latestWarningSeverity: "info" | "warning" | "critical" | null;
  warningCount: number;
};

export function StatusStrip({ taskRunId, teamSlugOrId, branch }: StatusStripProps) {
  // Run control data for lifecycle, provider, trust mode
  const runControlQuery = useQuery({
    ...getApiV1CmuxOrchestrationRunControlByTaskRunIdOptions({
      path: { taskRunId },
      query: { teamSlugOrId },
    }),
    enabled: Boolean(teamSlugOrId && taskRunId),
    refetchInterval: 10000, // Refresh every 10s for freshness
  });

  // Context health data
  const contextHealthQuery = useQuery({
    ...convexQuery(api.taskRuns.getContextHealth, {
      teamSlugOrId,
      id: taskRunId,
    }),
    enabled: Boolean(teamSlugOrId && taskRunId),
    refetchInterval: 15000, // Refresh every 15s
  });

  const summary = runControlQuery.data;
  const contextHealth = contextHealthQuery.data as ContextHealthData | undefined;

  // Compute freshness from last update timestamp
  const freshness = useMemo(() => {
    if (!summary) return null;
    // Use continuation.lastActiveAt if available, otherwise approximate from lifecycle
    const lastActiveAt =
      summary.continuation.lastActiveAt ?? summary.lifecycle.blockedAt ?? Date.now();
    const ageMs = Date.now() - lastActiveAt;
    return formatFreshness(ageMs);
  }, [summary]);

  if (runControlQuery.isLoading) {
    return (
      <div className="flex items-center gap-4 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
        <div className="h-4 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const lifecycle = getLifecycleDisplay(summary);
  const trust = getTrustDisplay(summary);
  const context = getContextDisplay(contextHealth);

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs overflow-x-auto">
      {/* Lifecycle status */}
      <StatusChip
        icon={lifecycle.icon}
        label={lifecycle.label}
        tone={lifecycle.tone}
        tooltip={lifecycle.tooltip}
      />

      {/* Trust mode (only show if not normal) */}
      {trust && (
        <StatusChip
          icon={trust.icon}
          label={trust.label}
          tone={trust.tone}
          tooltip={trust.tooltip}
        />
      )}

      {/* Context health */}
      {context && (
        <StatusChip
          icon={context.icon}
          label={context.label}
          tone={context.tone}
          tooltip={context.tooltip}
        />
      )}

      <div className="h-3 w-px bg-neutral-300 dark:bg-neutral-700" />

      {/* Branch */}
      {branch && (
        <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
          <GitBranch className="size-3" />
          <span className="max-w-32 truncate font-mono" title={branch}>
            {branch}
          </span>
        </div>
      )}

      {/* Provider/Model */}
      <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
        <Server className="size-3" />
        <span className="max-w-40 truncate" title={summary.agentName ?? summary.provider}>
          {summary.agentName ?? formatProvider(summary.provider)}
        </span>
      </div>

      <div className="flex-1" />

      {/* Event freshness */}
      {freshness && (
        <div
          className={clsx(
            "flex items-center gap-1",
            freshness.isStale
              ? "text-amber-600 dark:text-amber-400"
              : "text-neutral-500 dark:text-neutral-400"
          )}
          title={freshness.isStale ? "Event stream may be stale" : "Last activity"}
        >
          <Clock className="size-3" />
          <span>{freshness.label}</span>
        </div>
      )}
    </div>
  );
}

interface StatusChipProps {
  icon: typeof Play;
  label: string;
  tone: "green" | "amber" | "red" | "neutral" | "blue";
  tooltip?: string;
}

function StatusChip({ icon: Icon, label, tone, tooltip }: StatusChipProps) {
  const toneClasses: Record<typeof tone, string> = {
    green: "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30",
    amber: "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30",
    red: "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30",
    blue: "text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30",
    neutral: "text-neutral-600 dark:text-neutral-400 bg-neutral-200 dark:bg-neutral-800",
  };

  return (
    <div
      className={clsx(
        "flex items-center gap-1 px-2 py-0.5 rounded-full font-medium",
        toneClasses[tone]
      )}
      title={tooltip}
    >
      <Icon className="size-3" />
      <span>{label}</span>
    </div>
  );
}

type DisplayConfig = {
  icon: typeof Play;
  label: string;
  tone: "green" | "amber" | "red" | "neutral" | "blue";
  tooltip?: string;
};

function getLifecycleDisplay(summary: RunControlSummary): DisplayConfig {
  const status = summary.lifecycle.status;

  if (status === "active") {
    return {
      icon: Play,
      label: "Active",
      tone: "green",
      tooltip: "Run is actively executing",
    };
  }

  if (status === "interrupted") {
    return {
      icon: Pause,
      label: "Interrupted",
      tone: "amber",
      tooltip: summary.lifecycle.reason ?? "Run is paused",
    };
  }

  if (status === "completed") {
    return {
      icon: CheckCircle2,
      label: "Completed",
      tone: "green",
      tooltip: "Run completed successfully",
    };
  }

  if (status === "failed") {
    return {
      icon: AlertCircle,
      label: "Failed",
      tone: "red",
      tooltip: summary.lifecycle.reason ?? "Run failed",
    };
  }

  return {
    icon: Activity,
    label: "Skipped",
    tone: "neutral",
    tooltip: "Run was skipped",
  };
}

function getTrustDisplay(summary: RunControlSummary): DisplayConfig | null {
  const interruption = summary.lifecycle.interruptionStatus;
  const pendingApprovals = summary.approvals.pendingCount;

  // Show approval pending prominently
  if (pendingApprovals > 0 || interruption === "approval_pending") {
    return {
      icon: Shield,
      label: pendingApprovals > 1 ? `${pendingApprovals} approvals` : "Approval needed",
      tone: "amber",
      tooltip: `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} blocking continuation`,
    };
  }

  // Show other interruption states
  if (interruption === "paused_by_operator") {
    return {
      icon: Pause,
      label: "Paused",
      tone: "blue",
      tooltip: "Run paused by operator",
    };
  }

  if (interruption === "context_overflow") {
    return {
      icon: Brain,
      label: "Context overflow",
      tone: "red",
      tooltip: "Context window exceeded",
    };
  }

  if (interruption === "rate_limited") {
    return {
      icon: AlertTriangle,
      label: "Rate limited",
      tone: "amber",
      tooltip: "API rate limit reached",
    };
  }

  if (interruption === "timed_out") {
    return {
      icon: Clock,
      label: "Timed out",
      tone: "red",
      tooltip: "Run timed out",
    };
  }

  // Don't show chip for normal operation
  return null;
}

function getContextDisplay(health: ContextHealthData | undefined): DisplayConfig | null {
  if (!health) return null;

  const { usagePercent, latestWarningSeverity, warningCount } = health;

  // Show warning state if present
  if (latestWarningSeverity === "critical") {
    return {
      icon: AlertCircle,
      label: `Context critical${warningCount > 1 ? ` (${warningCount})` : ""}`,
      tone: "red",
      tooltip: "Context health is critical",
    };
  }

  if (latestWarningSeverity === "warning") {
    return {
      icon: AlertTriangle,
      label: `Context warning${warningCount > 1 ? ` (${warningCount})` : ""}`,
      tone: "amber",
      tooltip: "Context health warning",
    };
  }

  // Show usage if high
  if (usagePercent !== undefined && usagePercent > 80) {
    return {
      icon: Brain,
      label: `${Math.round(usagePercent)}% context`,
      tone: usagePercent > 90 ? "red" : "amber",
      tooltip: `Context window ${Math.round(usagePercent)}% used`,
    };
  }

  // Show normal usage only if > 50%
  if (usagePercent !== undefined && usagePercent > 50) {
    return {
      icon: Brain,
      label: `${Math.round(usagePercent)}% context`,
      tone: "neutral",
      tooltip: `Context window ${Math.round(usagePercent)}% used`,
    };
  }

  return null;
}

function formatProvider(provider: string): string {
  if (provider === "pve-lxc") return "PVE LXC";
  return provider
    .split(/[_-]/g)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function formatFreshness(ageMs: number): { label: string; isStale: boolean } {
  const seconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  // Consider stale if > 5 minutes for active runs
  const isStale = minutes > 5;

  if (seconds < 10) {
    return { label: "just now", isStale: false };
  }

  if (seconds < 60) {
    return { label: `${seconds}s ago`, isStale: false };
  }

  if (minutes < 60) {
    return { label: `${minutes}m ago`, isStale };
  }

  if (hours < 24) {
    return { label: `${hours}h ago`, isStale: true };
  }

  return { label: `${Math.floor(hours / 24)}d ago`, isStale: true };
}
