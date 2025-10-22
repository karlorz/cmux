import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isFakeConvexId } from "@/lib/fakeConvexId";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import {
  isCrownEvaluationStatus,
  type CrownEvaluationStatus,
} from "@cmux/shared/crown/status";
import { useQuery } from "convex/react";
// Read team slug from path to avoid route type coupling
import { AlertCircle, Crown, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface CrownStatusProps {
  taskId: Id<"tasks">;
  teamSlugOrId: string;
}

const LEGACY_STATUS_PENDING = "pending_evaluation" as const;
const LEGACY_STATUS_IN_PROGRESS = "in_progress" as const;

type StatusTone =
  | "loading"
  | "waiting"
  | "pending"
  | "evaluating"
  | "success"
  | "error"
  | "info";

const PILL_BASE_CLASS =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium";

const PILL_TONE_CLASSES: Record<StatusTone, string> = {
  loading:
    " bg-neutral-200 text-neutral-700 dark:bg-neutral-700/40 dark:text-neutral-200",
  waiting:
    " bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  pending:
    " bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  evaluating:
    " bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  success:
    " bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  error:
    " bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  info:
    " bg-neutral-100 text-neutral-700 dark:bg-neutral-700/40 dark:text-neutral-200",
};

const makePill = (tone: StatusTone, content: React.ReactNode) => (
  <div className={PILL_BASE_CLASS + PILL_TONE_CLASSES[tone]}>{content}</div>
);

const normalizeCrownStatus = (task?: {
  crownEvaluationStatus?: CrownEvaluationStatus | null;
  crownEvaluationError?: string | null;
}): CrownEvaluationStatus => {
  if (task?.crownEvaluationStatus) {
    if (isCrownEvaluationStatus(task.crownEvaluationStatus)) {
      return task.crownEvaluationStatus;
    }
  }

  if (task?.crownEvaluationError === LEGACY_STATUS_PENDING) {
    return "pending";
  }

  if (task?.crownEvaluationError === LEGACY_STATUS_IN_PROGRESS) {
    return "in_progress";
  }

  if (task?.crownEvaluationError && task.crownEvaluationError.trim().length > 0) {
    return "error";
  }

  return "idle";
};

export function CrownStatus({ taskId, teamSlugOrId }: CrownStatusProps) {
  const taskRuns = useQuery(
    api.taskRuns.getByTask,
    isFakeConvexId(taskId) ? "skip" : { teamSlugOrId, taskId },
  );

  const task = useQuery(
    api.tasks.getById,
    isFakeConvexId(taskId) ? "skip" : { teamSlugOrId, id: taskId },
  );

  const crownedRun = useQuery(
    api.crown.getCrownedRun,
    isFakeConvexId(taskId) ? "skip" : { teamSlugOrId, taskId },
  );

  const renderLoading = (message: string) => (
    <div className="mt-2 mb-4">
      {makePill(
        "loading",
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{message}</span>
        </>,
      )}
    </div>
  );

  if (task === undefined) {
    return null;
  }

  if (task === null) {
    return null;
  }

  const crownStatus = normalizeCrownStatus(task);
  const statusRequiresDisplay =
    crownStatus === "pending" ||
    crownStatus === "in_progress" ||
    crownStatus === "completed" ||
    crownStatus === "error";

  if (taskRuns === undefined) {
    return statusRequiresDisplay ? renderLoading("Loading crown status…") : null;
  }

  const runs = Array.isArray(taskRuns) ? taskRuns : [];
  const completedRuns = runs.filter((run) => run.status === "completed");
  const allCompleted = runs.every(
    (run) => run.status === "completed" || run.status === "failed",
  );

  const showStatus =
    runs.length >= 2 ||
    crownStatus === "pending" ||
    crownStatus === "in_progress" ||
    crownStatus === "completed" ||
    crownStatus === "error";

  if (!showStatus) {
    return null;
  }

  if (crownedRun === undefined && crownStatus === "completed") {
    return renderLoading("Fetching crown winner…");
  }

  const resolveAgentName = (run: { agentName?: string | null }) => {
    const fromRun = run.agentName?.trim();
    return fromRun && fromRun.length > 0 ? fromRun : "unknown agent";
  };

  let rendered: ReactNode | null = null;

  if (!allCompleted) {
    const waitingContent = (
      <>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>
          Waiting for models ({completedRuns.length}/{runs.length})
        </span>
      </>
    );
    const pill = makePill("waiting", waitingContent);
    rendered = (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent
          className="max-w-sm p-3 z-[var(--z-overlay)]"
          side="bottom"
          sideOffset={5}
        >
          <div className="space-y-2">
            <p className="font-medium text-sm">Crown Evaluation System</p>
            <p className="text-xs text-muted-foreground">
              Multiple AI models are working on your task in parallel. Once all
              models complete, Claude will evaluate and select the best
              implementation.
            </p>
            <div className="border-t pt-2 mt-2">
              <p className="text-xs font-medium mb-1">Competing models:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {runs.map((run, idx) => {
                  const agentName = resolveAgentName(run);
                  const status =
                    run.status === "completed"
                      ? "✓"
                      : run.status === "running"
                        ? "⏳"
                        : run.status === "failed"
                          ? "✗"
                          : "•";
                  return (
                    <li key={idx}>
                      {status} {agentName}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  } else if (crownStatus === "error") {
    const errorMessage = task.crownEvaluationError?.trim();
    const pill = makePill(
      "error",
      <>
        <AlertCircle className="w-3 h-3" />
        <span>Evaluation failed</span>
      </>,
    );
    rendered = errorMessage ? (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent
          className="max-w-sm p-3 z-[var(--z-overlay)]"
          side="bottom"
          sideOffset={5}
        >
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {errorMessage}
          </p>
        </TooltipContent>
      </Tooltip>
    ) : (
      pill
    );
  } else if (crownedRun) {
    const winnerContent = (
      <>
        <Crown className="w-3 h-3" />
        <span>Winner: {resolveAgentName(crownedRun)}</span>
      </>
    );
    const pill = makePill("success", winnerContent);
    rendered = crownedRun.crownReason ? (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent
          className="max-w-sm p-3 z-[var(--z-overlay)]"
          side="bottom"
          sideOffset={5}
        >
          <div className="space-y-2">
            <p className="font-medium text-sm">Evaluation Reason</p>
            <p className="text-xs text-muted-foreground">
              {crownedRun.crownReason}
            </p>
            <p className="text-xs text-muted-foreground border-t pt-2 mt-2">
              Evaluated against {runs.length} implementations
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    ) : (
      pill
    );
  } else if (crownStatus === "in_progress") {
    const evaluatingContent = (
      <>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Evaluating…</span>
      </>
    );
    const pill = makePill("evaluating", evaluatingContent);
    rendered = (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent
          className="max-w-sm p-3 z-[var(--z-overlay)]"
          side="bottom"
          sideOffset={5}
        >
          <div className="space-y-2">
            <p className="font-medium text-sm">AI Judge in Progress</p>
            <p className="text-xs text-muted-foreground">
              Claude is analyzing each implementation to determine the best
              solution. The evaluation considers completeness, quality, and
              correctness.
            </p>
            <div className="border-t pt-2 mt-2">
              <p className="text-xs font-medium mb-1">Completed implementations:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {completedRuns.map((run, idx) => {
                  const agentName = resolveAgentName(run);
                  return <li key={idx}>• {agentName}</li>;
                })}
              </ul>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  } else if (crownStatus === "pending") {
    const pendingContent = (
      <>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Queued for crown evaluation</span>
      </>
    );
    const pill = makePill("pending", pendingContent);
    rendered = (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent
          className="max-w-sm p-3 z-[var(--z-overlay)]"
          side="bottom"
          sideOffset={5}
        >
          <p className="text-xs text-muted-foreground">
            All implementations are ready. We will start the crown evaluation
            shortly and notify you when a winner is selected.
          </p>
        </TooltipContent>
      </Tooltip>
    );
  } else if (crownStatus === "completed") {
    rendered = makePill(
      "info",
      <>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Finalizing crown result…</span>
      </>,
    );
  } else {
    rendered = makePill(
      "pending",
      <>
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Pending evaluation</span>
      </>,
    );
  }

  return rendered ? <div className="mt-2 mb-4">{rendered}</div> : null;
}
