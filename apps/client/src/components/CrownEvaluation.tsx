import { isFakeConvexId } from "@/lib/fakeConvexId";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw, Trophy } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ConfirmDialog } from "./ui/confirm-dialog";

interface CrownEvaluationProps {
  taskId: Id<"tasks">;
  teamSlugOrId: string;
}

export function CrownEvaluation({
  taskId,
  teamSlugOrId,
}: CrownEvaluationProps) {
  const evaluation = useQuery(
    api.crown.getCrownEvaluation,
    isFakeConvexId(taskId) ? "skip" : { teamSlugOrId, taskId }
  );
  const crownedRun = useQuery(
    api.crown.getCrownedRun,
    isFakeConvexId(taskId) ? "skip" : { teamSlugOrId, taskId }
  );

  const refreshCrownMutation = useMutation(api.crown.refreshCrownEvaluation);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);

  if (!evaluation || !crownedRun) {
    return null;
  }

  const handleRefreshClick = () => {
    // Require confirmation if evaluation didn't have empty diffs
    if (!evaluation.hadEmptyDiffs) {
      setShowRefreshConfirm(true);
      return;
    }
    executeRefresh();
  };

  const executeRefresh = async () => {
    setIsRefreshing(true);
    setShowRefreshConfirm(false);
    try {
      await refreshCrownMutation({ teamSlugOrId, taskId });
    } catch (error) {
      console.error("[CrownEvaluation] Failed to refresh:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

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
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
            Crown Winner: {agentName}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            title="Refresh crown evaluation"
          >
            <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
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

      <ConfirmDialog
        open={showRefreshConfirm}
        onOpenChange={setShowRefreshConfirm}
        title="This evaluation appears complete."
        description="Re-running may produce different results. Continue?"
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={executeRefresh}
      />
    </Card>
  );
}
