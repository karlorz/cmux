/**
 * RunDashboard - Consolidated operator dashboard for task run detail
 *
 * Implements the six stable regions from issue #957:
 * 1. Status Strip - Run health, context usage, lifecycle state (top)
 * 2. Activity Timeline - Sequential event log (left)
 * 3. Approval Lane - Dedicated approval/control interface (right top)
 * 4. Diff/Artifacts - Git diff and test results (right middle)
 * 5. Inspector - Memory and context panel (right bottom, collapsible)
 * 6. Workspace - VSCode/Terminal access (expandable overlay)
 *
 * The goal: operator can answer "what is happening", "what is blocked",
 * and "what should I inspect next" from one page.
 */

import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery as useRQ } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode,
  GitCompare,
  Shield,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ActivityStream } from "@/components/ActivityStream";
import { CompactErrorFallback, ErrorBoundary } from "@/components/ErrorBoundary";
import { LiveDiffStats } from "@/components/LiveDiffStats";
import { LiveDiffPanel } from "@/components/LiveDiffPanel";
import { RuntimeLifecycleCard } from "@/components/dashboard/RuntimeLifecycleCard";
import { StatusStrip } from "@/components/dashboard/StatusStrip";
import { ApprovalRequestCard } from "@/components/orchestration/ApprovalRequestCard";
import { RunInspectorPanel } from "@/components/dashboard/RunInspectorPanel";
import type { TaskRunWithChildren } from "@/types/task";

interface RunDashboardProps {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
  taskId: Id<"tasks">;
  /** Callback to open workspace in expanded view */
  onOpenWorkspace?: () => void;
}

export function RunDashboard({
  taskRunId,
  teamSlugOrId,
  taskId,
  onOpenWorkspace,
}: RunDashboardProps) {
  const resetKey = `${taskId}-${taskRunId}`;
  const [inspectorExpanded, setInspectorExpanded] = useState(false);

  // Get task data for branch info
  const taskQuery = useRQ({
    ...convexQuery(api.tasks.getById, { teamSlugOrId, id: taskId }),
    enabled: Boolean(teamSlugOrId && taskId),
  });

  // Get task run data
  const taskRunsQuery = useRQ({
    ...convexQuery(api.taskRuns.getByTask, { teamSlugOrId, taskId }),
    enabled: Boolean(teamSlugOrId && taskId),
  });

  const selectedRun = useMemo(() => {
    return taskRunsQuery.data?.find((run) => run._id === taskRunId);
  }, [taskRunsQuery.data, taskRunId]);

  const sandboxId = selectedRun?.vscode?.containerName;
  const isRunning = selectedRun?.vscode?.status === "running";
  const provider = selectedRun?.vscode?.provider;

  // Extract repo and branch info for diff panel
  const repoFullName = taskQuery.data?.projectFullName;
  const baseBranch = taskQuery.data?.baseBranch ?? "main";
  // Head branch comes from the run's newBranch field
  const headBranch = selectedRun?.newBranch;

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-50 dark:bg-black">
      {/* Region 1: Status Strip - compact persistent bar */}
      <ErrorBoundary
        key={`${resetKey}-status-strip`}
        name="Status Strip"
        fallback={<CompactErrorFallback name="Status Strip" />}
      >
        <StatusStrip
          taskRunId={taskRunId}
          teamSlugOrId={teamSlugOrId}
          branch={headBranch}
        />
      </ErrorBoundary>

      {/* Region 1b: Run Control - detailed lifecycle card */}
      <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between gap-4">
            <ErrorBoundary
              key={`${resetKey}-run-control`}
              name="Run Control"
              fallback={<CompactErrorFallback name="Run Control" />}
            >
              <RuntimeLifecycleCard taskRunId={taskRunId} teamSlugOrId={teamSlugOrId} />
            </ErrorBoundary>

            {/* Quick actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {onOpenWorkspace && (
                <button
                  type="button"
                  onClick={onOpenWorkspace}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors"
                >
                  <Code2 className="size-4" />
                  Open Workspace
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content area - two column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left column: Activity Timeline */}
        <div className="flex flex-col w-1/2 min-w-0 border-r border-neutral-200 dark:border-neutral-800">
          {/* Live Diff Stats banner */}
          <ErrorBoundary
            key={`${resetKey}-live-diff-stats`}
            name="Live Diff Stats"
            fallback={<CompactErrorFallback name="Live Diff Stats" />}
          >
            <LiveDiffStats sandboxId={sandboxId} isRunning={isRunning} />
          </ErrorBoundary>

          {/* Activity Stream */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ErrorBoundary
              key={`${resetKey}-activity-stream`}
              name="Activity Stream"
              fallback={<CompactErrorFallback name="Activity Stream" />}
            >
              <ActivityStream taskRunId={taskRunId} provider={provider} />
            </ErrorBoundary>
          </div>
        </div>

        {/* Right column: Approval Lane, Diff/Artifacts, Inspector */}
        <div className="flex flex-col w-1/2 min-w-0">
          {/* Region 3: Approval Lane */}
          <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800">
            <ErrorBoundary
              key={`${resetKey}-approval-lane`}
              name="Approval Lane"
              fallback={<CompactErrorFallback name="Approval Lane" />}
            >
              <ApprovalLane taskRunId={taskRunId} teamSlugOrId={teamSlugOrId} />
            </ErrorBoundary>
          </div>

          {/* Region 4: Diff/Artifacts */}
          <div className="flex-1 min-h-0 overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
            <ErrorBoundary
              key={`${resetKey}-diff-artifacts`}
              name="Diff & Artifacts"
              fallback={<CompactErrorFallback name="Diff & Artifacts" />}
            >
              <DiffArtifactsPanel
                taskRunId={taskRunId}
                teamSlugOrId={teamSlugOrId}
                selectedRun={selectedRun}
                repoFullName={repoFullName}
                baseBranch={baseBranch}
                headBranch={headBranch}
              />
            </ErrorBoundary>
          </div>

          {/* Region 5: Inspector (collapsible) - consolidated session, checkpoint, memory */}
          <div
            className={clsx(
              "flex-shrink-0 transition-all duration-200",
              inspectorExpanded ? "h-80" : "h-10"
            )}
          >
            <div className="h-full flex flex-col">
              <button
                type="button"
                onClick={() => setInspectorExpanded(!inspectorExpanded)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                {inspectorExpanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRight className="size-4" />
                )}
                <span>Inspector</span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  (continuation, session, memory)
                </span>
              </button>
              {inspectorExpanded && (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ErrorBoundary
                    key={`${resetKey}-inspector`}
                    name="Inspector"
                    fallback={<CompactErrorFallback name="Inspector" />}
                  >
                    <RunInspectorPanel taskRunId={taskRunId} teamSlugOrId={teamSlugOrId} />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ApprovalLane - Dedicated approval interface for the run
 */
function ApprovalLane({
  taskRunId,
  teamSlugOrId,
}: {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
}) {
  const approvalsQuery = useRQ({
    ...convexQuery(api.approvalBroker.getByTaskRun, {
      teamSlugOrId,
      taskRunId,
    }),
    enabled: Boolean(teamSlugOrId && taskRunId),
  });

  const approvals = useMemo(() => {
    if (!approvalsQuery.data) {
      return [];
    }
    return [...approvalsQuery.data].sort((left, right) => {
      if (left.status === right.status) {
        return right.createdAt - left.createdAt;
      }
      if (left.status === "pending") return -1;
      if (right.status === "pending") return 1;
      return right.createdAt - left.createdAt;
    });
  }, [approvalsQuery.data]);

  if (approvalsQuery.error) {
    throw approvalsQuery.error;
  }

  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Shield
            className={clsx(
              "size-4",
              pendingCount > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-neutral-400 dark:text-neutral-500"
            )}
          />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Approvals
          </span>
        </div>
        <span
          className={clsx(
            "px-2 py-0.5 text-xs font-medium rounded-full",
            pendingCount > 0
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
          )}
        >
          {pendingCount > 0 ? `${pendingCount} pending` : approvals.length > 0 ? `${approvals.length} resolved` : "None"}
        </span>
      </div>

      {approvalsQuery.isLoading ? (
        <div className="h-12 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
      ) : approvals.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No approval requests for this run.
        </p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {approvals.slice(0, 3).map((approval) => (
            <ApprovalRequestCard
              key={approval._id}
              request={approval}
              teamSlugOrId={teamSlugOrId}
              onResolved={() => void approvalsQuery.refetch()}
            />
          ))}
          {approvals.length > 3 && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
              +{approvals.length - 3} more approvals
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * DiffArtifactsPanel - Git diff and test results in one region
 */
function DiffArtifactsPanel({
  taskRunId,
  teamSlugOrId,
  selectedRun,
  repoFullName,
  baseBranch,
  headBranch,
}: {
  taskRunId: Id<"taskRuns">;
  teamSlugOrId: string;
  selectedRun: TaskRunWithChildren | undefined;
  repoFullName: string | undefined;
  baseBranch: string | undefined;
  headBranch: string | undefined;
}) {
  const [activeTab, setActiveTab] = useState<"diff" | "tests">("diff");
  const sandboxId = selectedRun?.vscode?.containerName;
  const isRunning = selectedRun?.vscode?.status === "running";

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setActiveTab("diff")}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition-colors",
            activeTab === "diff"
              ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
        >
          <GitCompare className="size-4" />
          Diff
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tests")}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition-colors",
            activeTab === "tests"
              ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
              : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
        >
          <FileCode className="size-4" />
          Tests
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === "diff" ? (
          <LiveDiffPanel
            sandboxId={sandboxId}
            isRunning={isRunning}
            taskRunId={taskRunId}
            teamSlugOrId={teamSlugOrId}
            selectedRun={selectedRun}
            repoFullName={repoFullName}
            baseBranch={baseBranch}
            headBranch={headBranch}
          />
        ) : (
          <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">
            Test results will appear here when available.
          </div>
        )}
      </div>
    </div>
  );
}
