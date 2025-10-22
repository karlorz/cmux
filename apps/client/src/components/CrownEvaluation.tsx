import { isFakeConvexId } from "@/lib/fakeConvexId";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import {
  isCrownEvaluationStatus,
  type CrownEvaluationStatus,
} from "@cmux/shared/crown/status";
import { useQuery } from "convex/react";
// Read team slug from path to avoid route type coupling
import { AlertCircle, Loader2, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface CrownEvaluationProps {
  taskId: Id<"tasks">;
  teamSlugOrId: string;
}

const LEGACY_STATUS_PENDING = "pending_evaluation" as const;
const LEGACY_STATUS_IN_PROGRESS = "in_progress" as const;

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

export function CrownEvaluation({
  taskId,
  teamSlugOrId,
}: CrownEvaluationProps) {
  const task = useQuery(
    api.tasks.getById,
    isFakeConvexId(taskId) ? "skip" : { teamSlugOrId, id: taskId },
  );
  const evaluation = useQuery(
    api.crown.getCrownEvaluation,
    isFakeConvexId(taskId) ? "skip" : { teamSlugOrId, taskId }
  );
  const crownedRun = useQuery(
    api.crown.getCrownedRun,
    isFakeConvexId(taskId) ? "skip" : { teamSlugOrId, taskId }
  );

  if (task === undefined || evaluation === undefined || crownedRun === undefined) {
    return (
      <Card className="border-neutral-200 dark:border-neutral-700/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-500 dark:text-neutral-300" />
            Loading crown evaluation…
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            We’re retrieving the latest evaluation details for this task.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (task === null) {
    return null;
  }

  const crownStatus = normalizeCrownStatus(task);

  if (crownStatus === "error") {
    const errorMessage = task.crownEvaluationError?.trim() ??
      "The crown evaluator hit an unexpected error. You can retry from the task menu.";
    return (
      <Card className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-red-700 dark:text-red-300">
            <AlertCircle className="w-5 h-5" />
            Crown evaluation failed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">
            {errorMessage}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!evaluation || !crownedRun) {
    if (crownStatus === "pending") {
      return (
        <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="w-5 h-5 animate-spin text-yellow-600 dark:text-yellow-400" />
              Crown evaluation queued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-700 dark:text-neutral-200">
              Claude will compare the competing implementations shortly and
              report back with a winner.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (crownStatus === "in_progress") {
      return (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
              Crown evaluation in progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-700 dark:text-neutral-200">
              Claude is reviewing every implementation to decide which one best
              solves the task.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (crownStatus === "completed") {
      return (
        <Card className="border-neutral-200 dark:border-neutral-700/60 bg-neutral-50 dark:bg-neutral-800/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-500 dark:text-neutral-300" />
              Finalizing crown result…
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-700 dark:text-neutral-200">
              We’ve recorded the evaluation and are preparing the winner
              details.
            </p>
          </CardContent>
        </Card>
      );
    }

    return null;
  }

  // Prefer stored agentName, use "Unknown" when missing
  const crownedPullRequests = crownedRun.pullRequests ?? [];
  const fallbackPullRequestUrl =
    crownedRun.pullRequestUrl && crownedRun.pullRequestUrl !== "pending"
      ? crownedRun.pullRequestUrl
      : undefined;

  // Prefer stored agentName, use "Unknown" when missing
  const storedAgentName = crownedRun.agentName?.trim();
  const agentName =
    storedAgentName && storedAgentName.length > 0 ? storedAgentName : "unknown agent";

  return (
    <Card className="border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
          Crown Winner: {agentName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm text-neutral-600 dark:text-neutral-400 mb-1">
              Evaluation Reason
            </h4>
            <p className="text-sm text-neutral-800 dark:text-neutral-200">
              {crownedRun.crownReason ||
                "This implementation was selected as the best solution."}
            </p>
          </div>

          {crownedPullRequests.length > 0 ? (
            <div>
              <h4 className="font-medium text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                Pull Requests
              </h4>
              <div className="flex flex-col gap-1">
                {crownedPullRequests.map((pr) => (
                  pr.url ? (
                    <a
                      key={pr.repoFullName}
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {pr.repoFullName} ({pr.state ?? "none"}) →
                    </a>
                  ) : (
                    <span
                      key={pr.repoFullName}
                      className="text-sm text-neutral-500 dark:text-neutral-400"
                    >
                      {pr.repoFullName} ({pr.state ?? "none"})
                    </span>
                  )
                ))}
              </div>
            </div>
          ) : fallbackPullRequestUrl ? (
            <div>
              <h4 className="font-medium text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                Pull Request
              </h4>
              <a
                href={fallbackPullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {crownedRun.pullRequestIsDraft ? "View draft PR" : "View PR"} →
              </a>
            </div>
          ) : null}

          <div className="pt-2 border-t border-yellow-200 dark:border-yellow-800">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Evaluated against {evaluation.candidateRunIds.length}{" "}
              implementations
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
