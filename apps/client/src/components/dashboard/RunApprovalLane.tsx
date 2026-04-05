import type { Id } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useRQ } from "@tanstack/react-query";
import clsx from "clsx";
import { Shield } from "lucide-react";
import { useMemo, useState } from "react";

import { ApprovalRequestCard } from "@/components/orchestration/ApprovalRequestCard";
import { api } from "@cmux/convex/api";

interface RunApprovalLaneProps {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
  className?: string;
}

export function RunApprovalLane({
  taskRunId,
  teamSlugOrId,
  className,
}: RunApprovalLaneProps) {
  const [showHistory, setShowHistory] = useState(false);

  const approvalsQuery = useRQ({
    ...convexQuery(api.approvalBroker.getByTaskRun, {
      teamSlugOrId,
      taskRunId,
    }),
    enabled: Boolean(teamSlugOrId && taskRunId),
  });

  const { pendingApprovals, resolvedApprovals, pendingCount } = useMemo(() => {
    if (!approvalsQuery.data) {
      return { pendingApprovals: [], resolvedApprovals: [], pendingCount: 0 };
    }
    const sorted = [...approvalsQuery.data].sort(
      (left, right) => right.createdAt - left.createdAt,
    );
    const pending = sorted.filter((approval) => approval.status === "pending");
    const resolved = sorted.filter((approval) => approval.status !== "pending");
    return {
      pendingApprovals: pending,
      resolvedApprovals: resolved,
      pendingCount: pending.length,
    };
  }, [approvalsQuery.data]);

  if (approvalsQuery.error) {
    throw approvalsQuery.error;
  }

  if (approvalsQuery.isLoading) {
    return (
      <div className={clsx("px-4 py-3", className)}>
        <div className="h-12 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
    );
  }

  if (pendingApprovals.length === 0 && resolvedApprovals.length === 0) {
    return null;
  }

  const isBlocking = pendingCount > 0;

  return (
    <div className={clsx("px-4 py-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Shield
              className={clsx(
                "size-4",
                isBlocking
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-neutral-400 dark:text-neutral-500",
              )}
            />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Run-control approvals
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {isBlocking
              ? `Resolve pending approval${pendingCount > 1 ? "s" : ""} before continuing the run.`
              : "Approval history recorded for this run."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {resolvedApprovals.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((value) => !value)}
              className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              {showHistory ? "Hide" : "Show"} history ({resolvedApprovals.length})
            </button>
          )}
          <span
            className={clsx(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              isBlocking
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
            )}
          >
            {isBlocking ? `${pendingCount} pending` : `${resolvedApprovals.length} recorded`}
          </span>
        </div>
      </div>

      {isBlocking && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
            <Shield className="size-4" />
            Run is blocked on approval
          </div>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            Resolve pending approval{pendingCount > 1 ? "s" : ""} to continue. After resolution,
            the run will resume via its continuation path.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {pendingApprovals.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Pending ({pendingApprovals.length})
            </div>
            {pendingApprovals.map((approval) => (
              <ApprovalRequestCard
                key={approval._id}
                request={approval}
                teamSlugOrId={teamSlugOrId}
                onResolved={() => void approvalsQuery.refetch()}
              />
            ))}
          </div>
        )}

        {showHistory && resolvedApprovals.length > 0 && (
          <div className="space-y-2 border-t border-neutral-200 pt-2 dark:border-neutral-700">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              History ({resolvedApprovals.length})
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {resolvedApprovals.slice(0, 5).map((approval) => (
                <ApprovalRequestCard
                  key={approval._id}
                  request={approval}
                  teamSlugOrId={teamSlugOrId}
                />
              ))}
              {resolvedApprovals.length > 5 && (
                <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
                  +{resolvedApprovals.length - 5} more in history
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
