import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import clsx from "clsx";
import type { Doc } from "@cmux/convex/dataModel";
import type { CrownEvaluationStatus } from "@cmux/shared/crown";
import { AlertCircle, Crown, Loader2 } from "lucide-react";
import { Fragment } from "react";

const LEGACY_PENDING_EVALUATION = "pending_evaluation" as const;
const LEGACY_IN_PROGRESS_EVALUATION = "in_progress" as const;

export type TaskRunSummary = Pick<
  Doc<"taskRuns">,
  | "_id"
  | "status"
  | "agentName"
  | "isCrowned"
  | "crownReason"
  | "completedAt"
  | "exitCode"
>;

interface CrownStatusBadgeProps {
  task: Doc<"tasks">;
  runs: TaskRunSummary[];
  isLoading?: boolean;
  className?: string;
}

function deriveStatus(task: Doc<"tasks">): CrownEvaluationStatus | null {
  const status = task.crownEvaluationStatus;
  switch (status) {
    case "pending":
    case "in_progress":
    case "succeeded":
    case "failed":
      return status;
    default:
      break;
  }

  if (task.crownEvaluationError === LEGACY_PENDING_EVALUATION) {
    return "pending";
  }

  if (task.crownEvaluationError === LEGACY_IN_PROGRESS_EVALUATION) {
    return "in_progress";
  }

  return null;
}

function deriveError(
  task: Doc<"tasks">,
  status: CrownEvaluationStatus | null,
): string | null {
  if (status === "failed") {
    return task.crownEvaluationError ?? "Crown evaluation failed";
  }

  const legacyError = task.crownEvaluationError;
  if (
    !status &&
    legacyError &&
    legacyError !== LEGACY_PENDING_EVALUATION &&
    legacyError !== LEGACY_IN_PROGRESS_EVALUATION
  ) {
    return legacyError;
  }

  return null;
}

function resolveAgentName(run?: Pick<TaskRunSummary, "agentName"> | null) {
  const fromRun = run?.agentName?.trim();
  return fromRun && fromRun.length > 0 ? fromRun : "unknown agent";
}

function renderRunsList(runs: TaskRunSummary[]) {
  if (runs.length === 0) {
    return null;
  }

  return (
    <ul className="text-xs text-muted-foreground space-y-0.5">
      {runs.map((run) => {
        let symbol = "•";
        switch (run.status) {
          case "completed":
            symbol = "✓";
            break;
          case "running":
            symbol = "⏳";
            break;
          case "failed":
            symbol = "✗";
            break;
          default:
            break;
        }
        return (
          <li key={run._id}>
            {symbol} {resolveAgentName(run)}
          </li>
        );
      })}
    </ul>
  );
}

const BADGE_BASE_CLASS =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium";

export function CrownStatusBadge({
  task,
  runs,
  isLoading = false,
  className,
}: CrownStatusBadgeProps) {
  const status = deriveStatus(task);
  const errorMessage = deriveError(task, status);
  const totalRuns = runs.length;
  const completedRuns = runs.filter((run) => run.status === "completed");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const crownedRun = runs.find((run) => run.isCrowned);
  const allRunsFinished =
    totalRuns > 0 && completedRuns.length + failedRuns.length === totalRuns;
  const waitingForRuns = totalRuns >= 2 && !allRunsFinished;

  const placeholder = (
    <span className="text-[11px] text-neutral-400 dark:text-neutral-500">—</span>
  );

  if (isLoading) {
    return (
      <div className={clsx("flex-shrink-0", className)}>
        <div
          className={clsx(
            BADGE_BASE_CLASS,
            "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
          )}
        >
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading crown…
        </div>
      </div>
    );
  }

  if (waitingForRuns) {
    const waitingContent = (
      <div
        className={clsx(
          BADGE_BASE_CLASS,
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
        )}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Waiting ({completedRuns.length}/{totalRuns})
      </div>
    );

    return (
      <div className={clsx("flex-shrink-0", className)}>
        <Tooltip>
          <TooltipTrigger asChild>{waitingContent}</TooltipTrigger>
          <TooltipContent
            className="max-w-sm p-3 z-[var(--z-overlay)]"
            side="bottom"
            sideOffset={6}
          >
            <div className="space-y-2">
              <p className="font-medium text-sm">Models still running</p>
              <p className="text-xs text-muted-foreground">
                Crown waits for every model to finish before the AI judge runs.
              </p>
              <div className="border-t pt-2 mt-2">
                <p className="text-xs font-medium mb-1">Current statuses:</p>
                {renderRunsList(runs)}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (status === "pending") {
    const pendingContent = (
      <div
        className={clsx(
          BADGE_BASE_CLASS,
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
        )}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Queued for judging
      </div>
    );

    return (
      <div className={clsx("flex-shrink-0", className)}>
        <Tooltip>
          <TooltipTrigger asChild>{pendingContent}</TooltipTrigger>
          <TooltipContent
            className="max-w-sm p-3 z-[var(--z-overlay)]"
            side="bottom"
            sideOffset={6}
          >
            <div className="space-y-2">
              <p className="font-medium text-sm">Queued for crown evaluation</p>
              <p className="text-xs text-muted-foreground">
                All candidates finished. Crown will ask the AI judge to pick the
                best implementation shortly.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (status === "in_progress") {
    const evaluatingContent = (
      <div
        className={clsx(
          BADGE_BASE_CLASS,
          "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
        )}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Evaluating…
      </div>
    );

    return (
      <div className={clsx("flex-shrink-0", className)}>
        <Tooltip>
          <TooltipTrigger asChild>{evaluatingContent}</TooltipTrigger>
          <TooltipContent
            className="max-w-sm p-3 z-[var(--z-overlay)]"
            side="bottom"
            sideOffset={6}
          >
            <div className="space-y-2">
              <p className="font-medium text-sm">AI judge in progress</p>
              <p className="text-xs text-muted-foreground">
                Crown is comparing each implementation for quality, completeness,
                and correctness.
              </p>
              <div className="border-t pt-2 mt-2">
                <p className="text-xs font-medium mb-1">Completed candidates:</p>
                {renderRunsList(completedRuns)}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (status === "succeeded" || crownedRun) {
    const winner = crownedRun ?? completedRuns.find((run) => run.status === "completed");
    const reason = crownedRun?.crownReason;
    const winnerContent = (
      <div
        className={clsx(
          BADGE_BASE_CLASS,
          "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
        )}
      >
        <Crown className="w-3 h-3" />
        Winner: {resolveAgentName(winner)}
      </div>
    );

    if (!reason) {
      return <div className={clsx("flex-shrink-0", className)}>{winnerContent}</div>;
    }

    return (
      <div className={clsx("flex-shrink-0", className)}>
        <Tooltip>
          <TooltipTrigger asChild>{winnerContent}</TooltipTrigger>
          <TooltipContent
            className="max-w-sm p-3 z-[var(--z-overlay)]"
            side="bottom"
            sideOffset={6}
          >
            <div className="space-y-2">
              <p className="font-medium text-sm">Why crown picked this run</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line">
                {reason}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (status === "failed" || errorMessage) {
    const message = errorMessage ?? "Crown evaluation failed";
    const errorContent = (
      <div
        className={clsx(
          BADGE_BASE_CLASS,
          "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
        )}
      >
        <AlertCircle className="w-3 h-3" />
        Evaluation failed
      </div>
    );

    return (
      <div className={clsx("flex-shrink-0", className)}>
        <Tooltip>
          <TooltipTrigger asChild>{errorContent}</TooltipTrigger>
          <TooltipContent
            className="max-w-sm p-3 z-[var(--z-overlay)]"
            side="bottom"
            sideOffset={6}
          >
            <div className="space-y-2">
              <p className="font-medium text-sm">Crown evaluation failed</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line">
                {message}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (totalRuns >= 2 && allRunsFinished) {
    const pendingContent = (
      <div
        className={clsx(
          BADGE_BASE_CLASS,
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
        )}
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        Pending evaluation
      </div>
    );

    return (
      <div className={clsx("flex-shrink-0", className)}>
        <Tooltip>
          <TooltipTrigger asChild>{pendingContent}</TooltipTrigger>
          <TooltipContent
            className="max-w-sm p-3 z-[var(--z-overlay)]"
            side="bottom"
            sideOffset={6}
          >
            <div className="space-y-2">
              <p className="font-medium text-sm">Waiting for crown</p>
              <p className="text-xs text-muted-foreground">
                All runs are finished. Crown will trigger evaluation soon.
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  if (totalRuns === 0) {
    return <div className={clsx("flex-shrink-0", className)}>{placeholder}</div>;
  }

  const defaultContent = (
    <Fragment>
      {completedRuns.length > 0 ? `${completedRuns.length} completed` : "No results yet"}
    </Fragment>
  );

  return (
    <div className={clsx("flex-shrink-0", className)}>
      <div
        className={clsx(
          BADGE_BASE_CLASS,
          "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
        )}
      >
        {defaultContent}
      </div>
    </div>
  );
}
