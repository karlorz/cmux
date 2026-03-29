import type { Id } from "@cmux/convex/dataModel";
import type { RunControlSummary } from "@cmux/shared";
import { getApiV1CmuxOrchestrationRunControlByTaskRunIdOptions } from "@cmux/www-openapi-client/react-query";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertCircle,
  CheckCircle2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
} from "lucide-react";
import type { ReactNode } from "react";

interface RuntimeLifecycleCardProps {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
}

type RunControlAction = RunControlSummary["actions"]["availableActions"][number];
type ContinuationMode = RunControlSummary["continuation"]["mode"];
type InterruptionStatus = RunControlSummary["lifecycle"]["interruptionStatus"];
type LifecycleStatus = RunControlSummary["lifecycle"]["status"];
type RiskLevel = NonNullable<RunControlSummary["approvals"]["latestRiskLevel"]>;

type ToneConfig = {
  className: string;
  iconClassName: string;
};

type Guidance = {
  description: string;
  label: string;
};

type StatusPresentation = ToneConfig & {
  icon: typeof Play;
  label: string;
};

const DEFAULT_BADGE_TONE: ToneConfig = {
  className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  iconClassName: "text-neutral-600 dark:text-neutral-400",
};

/**
 * RuntimeLifecycleCard renders the shared run-control contract for the
 * common run-detail path, keeping lifecycle, approvals, and continuation
 * terminology aligned in one operator-facing summary.
 *
 * Issue #902: align run-detail controls with shared run-control contract
 */
export function RuntimeLifecycleCard({
  taskRunId,
  teamSlugOrId,
}: RuntimeLifecycleCardProps) {
  const {
    data: summary,
    error,
    isLoading,
  } = useQuery({
    ...getApiV1CmuxOrchestrationRunControlByTaskRunIdOptions({
      path: { taskRunId },
      query: { teamSlugOrId },
    }),
    enabled: Boolean(teamSlugOrId && taskRunId),
  });

  if (error) {
    throw error;
  }

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

  if (!summary) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <RefreshCw className="size-4" />
          <span className="text-sm">No run-control data</span>
        </div>
      </div>
    );
  }

  const lifecycle = getLifecyclePresentation(summary);
  const continuation = getContinuationPresentation(summary.continuation.mode);
  const guidance = getOperatorGuidance(summary);
  const availableActions = summary.actions.availableActions.map(getActionLabel);
  const approvalTone = getApprovalTone(summary.approvals.pendingCount > 0);
  const latestRiskLevel = getRiskLevelPresentation(summary.approvals.latestRiskLevel);
  const LifecycleIcon = lifecycle.icon;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Run Control
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {summary.agentName ? `${summary.agentName} via ` : ""}
            {formatProviderLabel(summary.provider)}
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-1">
          <StatusBadge presentation={lifecycle} />
          {summary.approvals.pendingCount > 0 && (
            <span
              className={clsx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                approvalTone.className
              )}
            >
              <Shield className={clsx("size-3", approvalTone.iconClassName)} />
              {summary.approvals.pendingCount} pending approval
              {summary.approvals.pendingCount === 1 ? "" : "s"}
            </span>
          )}
          {summary.continuation.mode !== "none" && (
            <StatusBadge presentation={continuation} />
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3 border-t border-neutral-200 pt-3 text-xs dark:border-neutral-800">
        <ControlSection title="Operator guidance">
          <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
            <ControlIcon summary={summary} />
            <span className="text-sm font-medium">{guidance.label}</span>
          </div>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            {guidance.description}
          </p>
          {availableActions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {availableActions.map((action) => (
                <span
                  key={action}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {action}
                </span>
              ))}
            </div>
          )}
        </ControlSection>

        {(summary.approvals.pendingCount > 0 || summary.approvals.latestRequestId) && (
          <ControlSection title="Approval lane">
            <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
              <Shield className={clsx("size-3.5", approvalTone.iconClassName)} />
              <span className="text-sm font-medium">
                {summary.approvals.pendingCount > 0
                  ? `${summary.approvals.pendingCount} approval${
                      summary.approvals.pendingCount === 1 ? "" : "s"
                    } blocking continuation`
                  : `Latest approval ${formatStatusLabel(
                      summary.approvals.latestStatus ?? "cancelled"
                    ).toLowerCase()}`}
              </span>
            </div>

            {summary.approvals.latestAction && (
              <code className="mt-2 block rounded bg-neutral-100 px-2 py-1.5 text-[11px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {summary.approvals.latestAction}
              </code>
            )}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-neutral-600 dark:text-neutral-400">
              {summary.approvals.latestApprovalType && (
                <span>
                  Type:{" "}
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {formatLabel(summary.approvals.latestApprovalType)}
                  </span>
                </span>
              )}
              {latestRiskLevel && (
                <span>
                  Risk:{" "}
                  <span className={clsx("font-medium", latestRiskLevel.className)}>
                    {latestRiskLevel.label}
                  </span>
                </span>
              )}
              {summary.approvals.currentRequestId && (
                <span>
                  Current request:{" "}
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {truncateId(summary.approvals.currentRequestId)}
                  </code>
                </span>
              )}
              {summary.approvals.latestCreatedAt && (
                <span>Requested: {formatTimestamp(summary.approvals.latestCreatedAt)}</span>
              )}
            </div>
          </ControlSection>
        )}

        <ControlSection title="Continuation path">
          <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
            <RotateCcw className={clsx("size-3.5", continuation.iconClassName)} />
            <span className="text-sm font-medium">{continuation.label}</span>
          </div>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            {getContinuationDescription(summary)}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-neutral-600 dark:text-neutral-400">
            {summary.continuation.providerSessionId && (
              <span>
                Session:{" "}
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {truncateId(summary.continuation.providerSessionId)}
                </code>
              </span>
            )}
            {summary.continuation.providerThreadId && (
              <span>
                Thread:{" "}
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {truncateId(summary.continuation.providerThreadId)}
                </code>
              </span>
            )}
            {summary.continuation.checkpointRef && (
              <span>
                Checkpoint:{" "}
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {truncateId(summary.continuation.checkpointRef)}
                </code>
              </span>
            )}
            {summary.continuation.checkpointGeneration !== undefined && (
              <span>Generation: {summary.continuation.checkpointGeneration}</span>
            )}
            {summary.continuation.sessionStatus && (
              <span>
                Binding:{" "}
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {formatLabel(summary.continuation.sessionStatus)}
                </span>
              </span>
            )}
            {summary.continuation.lastActiveAt && (
              <span>Last active: {formatTimestamp(summary.continuation.lastActiveAt)}</span>
            )}
          </div>
        </ControlSection>

        <ControlSection title="Lifecycle">
          <div className="flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
            <LifecycleIcon className={clsx("size-3.5", lifecycle.iconClassName)} />
            <span className="text-sm font-medium">{lifecycle.label}</span>
          </div>
          {summary.lifecycle.reason && (
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              {summary.lifecycle.reason}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-neutral-600 dark:text-neutral-400">
            <span>
              Run status:{" "}
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {formatStatusLabel(summary.runStatus)}
              </span>
            </span>
            {summary.lifecycle.blockedAt && (
              <span>Blocked: {formatTimestamp(summary.lifecycle.blockedAt)}</span>
            )}
            {summary.lifecycle.expiresAt && !summary.lifecycle.resolvedAt && (
              <span>Expires: {formatTimestamp(summary.lifecycle.expiresAt)}</span>
            )}
            {summary.lifecycle.resolvedAt && (
              <span>
                Resolved: {formatTimestamp(summary.lifecycle.resolvedAt)}
                {summary.lifecycle.resolvedBy ? ` by ${summary.lifecycle.resolvedBy}` : ""}
              </span>
            )}
          </div>
        </ControlSection>
      </div>
    </div>
  );
}

function ControlIcon({ summary }: { summary: RunControlSummary }) {
  if (summary.actions.canResolveApproval) {
    return <Shield className="size-3.5 text-amber-600 dark:text-amber-400" />;
  }
  if (summary.lifecycle.status === "interrupted") {
    if (summary.actions.canResumeCheckpoint) {
      return <RotateCcw className="size-3.5 text-blue-600 dark:text-blue-400" />;
    }
    if (summary.actions.canContinueSession) {
      return <Play className="size-3.5 text-green-600 dark:text-green-400" />;
    }
    if (summary.actions.canAppendInstruction) {
      return <RefreshCw className="size-3.5 text-neutral-600 dark:text-neutral-400" />;
    }
  }
  if (summary.lifecycle.status === "active") {
    return <Play className="size-3.5 text-green-600 dark:text-green-400" />;
  }
  if (summary.lifecycle.status === "completed") {
    return <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />;
  }
  if (summary.lifecycle.status === "failed") {
    return <AlertCircle className="size-3.5 text-red-600 dark:text-red-400" />;
  }
  return <Pause className="size-3.5 text-neutral-600 dark:text-neutral-400" />;
}

function ControlSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </p>
      {children}
    </section>
  );
}

function StatusBadge({ presentation }: { presentation: StatusPresentation }) {
  const Icon = presentation.icon;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        presentation.className
      )}
    >
      <Icon className={clsx("size-3", presentation.iconClassName)} />
      {presentation.label}
    </span>
  );
}

function getOperatorGuidance(summary: RunControlSummary): Guidance {
  if (summary.actions.canResolveApproval) {
    const pendingCount = summary.approvals.pendingCount;
    return {
      label: "Resolve approval",
      description:
        pendingCount === 1
          ? "Resolve the pending approval before continuing the run."
          : `Resolve the ${pendingCount} pending approvals before continuing the run.`,
    };
  }

  if (summary.lifecycle.status === "interrupted") {
    if (summary.actions.canResumeCheckpoint) {
      return {
        label: "Resume checkpoint",
        description:
          "Resume from the stored checkpoint for this run. This path restores state instead of reconnecting an existing provider session.",
      };
    }

    if (summary.actions.canContinueSession) {
      return {
        label: "Continue session",
        description:
          "Continue the existing provider session for this run. This is provider-session continuation, not checkpoint recovery.",
      };
    }

    if (summary.actions.canAppendInstruction) {
      return {
        label: "Append instruction",
        description:
          "No resumable session or checkpoint is advertised. Continue by appending a new operator instruction to the run.",
      };
    }
  }

  if (summary.lifecycle.status === "active") {
    return {
      label: "Monitor active run",
      description:
        summary.continuation.mode === "session_continuation"
          ? "The run is active. If intervention is needed later, the current continuation path is Continue session."
          : summary.continuation.mode === "checkpoint_restore"
            ? "The run is active and has a checkpoint path available if it stops."
            : summary.continuation.mode === "append_instruction"
              ? "The run is active. If you need to redirect it, use Append instruction rather than a generic resume."
              : "The run is active and does not currently advertise a continuation path.",
    };
  }

  if (summary.lifecycle.status === "completed") {
    return {
      label: "Run completed",
      description:
        "This run completed successfully. No additional run-control action is advertised for the common path.",
    };
  }

  if (summary.lifecycle.status === "failed") {
    return {
      label: "Run failed",
      description:
        "This run failed. Review the activity stream and lineage before starting a follow-up run.",
    };
  }

  return {
    label: "Run skipped",
    description:
      "This run was skipped. No run-control continuation path is currently available.",
  };
}

function getLifecyclePresentation(summary: RunControlSummary): StatusPresentation {
  const interruptionLabel = getInterruptionLabel(summary.lifecycle.interruptionStatus);

  const lifecycleByStatus: Record<LifecycleStatus, StatusPresentation> = {
    active: {
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      icon: Play,
      iconClassName: "text-green-600 dark:text-green-400",
      label: "Active",
    },
    interrupted: {
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      icon: Pause,
      iconClassName: "text-amber-600 dark:text-amber-400",
      label: interruptionLabel,
    },
    completed: {
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      icon: CheckCircle2,
      iconClassName: "text-green-600 dark:text-green-400",
      label: "Completed",
    },
    failed: {
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      icon: AlertCircle,
      iconClassName: "text-red-600 dark:text-red-400",
      label: "Failed",
    },
    skipped: {
      className: DEFAULT_BADGE_TONE.className,
      icon: RefreshCw,
      iconClassName: DEFAULT_BADGE_TONE.iconClassName,
      label: "Skipped",
    },
  };

  return lifecycleByStatus[summary.lifecycle.status];
}

function getContinuationPresentation(mode: ContinuationMode): StatusPresentation {
  const base: Record<ContinuationMode, StatusPresentation> = {
    session_continuation: {
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      icon: Play,
      iconClassName: "text-blue-600 dark:text-blue-400",
      label: "Continue session",
    },
    checkpoint_restore: {
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      icon: RotateCcw,
      iconClassName: "text-amber-600 dark:text-amber-400",
      label: "Resume checkpoint",
    },
    append_instruction: {
      className: DEFAULT_BADGE_TONE.className,
      icon: RefreshCw,
      iconClassName: DEFAULT_BADGE_TONE.iconClassName,
      label: "Append instruction",
    },
    none: {
      className: DEFAULT_BADGE_TONE.className,
      icon: Pause,
      iconClassName: DEFAULT_BADGE_TONE.iconClassName,
      label: "No continuation path",
    },
  };

  return base[mode];
}

function getContinuationDescription(summary: RunControlSummary): string {
  if (summary.continuation.mode === "session_continuation") {
    return "Continue session reconnects the current provider session for this run. It does not restore from a checkpoint snapshot.";
  }

  if (summary.continuation.mode === "checkpoint_restore") {
    return "Resume checkpoint restores from the stored checkpoint reference for this run instead of reconnecting a live provider session.";
  }

  if (summary.continuation.mode === "append_instruction") {
    return "Append instruction is the fallback path when no resumable session or checkpoint is advertised for the run.";
  }

  if (summary.lifecycle.status === "completed") {
    return "The run is complete, so no continuation path is advertised.";
  }

  if (summary.lifecycle.status === "failed") {
    return "The run failed and does not currently advertise a continuation path.";
  }

  return "No continuation path is currently advertised for the common run-control path.";
}

function getInterruptionLabel(status: InterruptionStatus): string {
  const labels: Record<InterruptionStatus, string> = {
    none: "Active",
    approval_pending: "Awaiting approval",
    paused_by_operator: "Paused by operator",
    sandbox_paused: "Sandbox paused",
    context_overflow: "Context overflow",
    rate_limited: "Rate limited",
    timed_out: "Timed out",
    checkpoint_pending: "Checkpoint pending",
    handoff_pending: "Handoff pending",
    user_input_required: "User input required",
  };

  return labels[status];
}

function getActionLabel(action: RunControlAction): string {
  const labels: Record<RunControlAction, string> = {
    resolve_approval: "Resolve approval",
    continue_session: "Continue session",
    resume_checkpoint: "Resume checkpoint",
    append_instruction: "Append instruction",
  };

  return labels[action];
}

function getApprovalTone(hasPendingApprovals: boolean): ToneConfig {
  if (hasPendingApprovals) {
    return {
      className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      iconClassName: "text-amber-600 dark:text-amber-400",
    };
  }

  return DEFAULT_BADGE_TONE;
}

function getRiskLevelPresentation(level?: RiskLevel | undefined) {
  if (!level) {
    return null;
  }

  if (level === "low") {
    return {
      className: "text-green-600 dark:text-green-400",
      label: "Low",
    };
  }

  if (level === "medium") {
    return {
      className: "text-amber-600 dark:text-amber-400",
      label: "Medium",
    };
  }

  return {
    className: "text-red-600 dark:text-red-400",
    label: "High",
  };
}

function formatProviderLabel(provider: string): string {
  if (provider === "pve-lxc") {
    return "PVE LXC";
  }

  return provider
    .split(/[_-]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatLabel(value: string): string {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatStatusLabel(value: string): string {
  if (value === "user_input_required") {
    return "User input required";
  }

  return formatLabel(value);
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateId(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
