import { useState } from "react";
import { api } from "@cmux/convex/api";
import { useQuery, useMutation } from "convex/react";
import {
  GitMerge,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowUp,
  ArrowDown,
  X,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Doc, Id } from "@cmux/convex/dataModel";

interface MergeQueueListProps {
  teamSlugOrId: string;
}

type QueueItem = Doc<"prMergeQueue">;
type QueueStatus = QueueItem["status"];

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function StatusBadge({ status }: { status: QueueStatus }) {
  const variants: Record<QueueStatus, { icon: React.ReactNode; label: string; className: string }> = {
    queued: {
      icon: <Clock className="w-3 h-3" />,
      label: "Queued",
      className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    },
    checks_pending: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      label: "Checks Running",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    ready: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: "Ready",
      className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    merging: {
      icon: <GitMerge className="w-3 h-3 animate-pulse" />,
      label: "Merging",
      className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    },
    merged: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: "Merged",
      className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    failed: {
      icon: <XCircle className="w-3 h-3" />,
      label: "Failed",
      className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
    cancelled: {
      icon: <X className="w-3 h-3" />,
      label: "Cancelled",
      className: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
    },
  };

  const variant = variants[status];

  return (
    <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1 w-fit", variant.className)}>
      {variant.icon}
      {variant.label}
    </span>
  );
}

function RiskIndicator({ score }: { score?: number }) {
  if (score === undefined) return null;

  const level = score >= 7 ? "high" : score >= 4 ? "medium" : "low";
  const colors = {
    high: "text-red-500",
    medium: "text-yellow-500",
    low: "text-green-500",
  };

  return (
    <span className={cn("flex items-center gap-1 text-xs", colors[level])}>
      <AlertTriangle className="w-3 h-3" />
      Risk: {score.toFixed(1)}
    </span>
  );
}

export function MergeQueueList({ teamSlugOrId }: MergeQueueListProps) {
  const [showHistory, setShowHistory] = useState(false);

  const queueItems = useQuery(api.prMergeQueue.list, { teamSlugOrId });
  const historyItems = useQuery(
    api.prMergeQueue.list,
    showHistory ? { teamSlugOrId, status: "merged", limit: 10 } : "skip"
  );

  const cancelItem = useMutation(api.prMergeQueue.cancel);
  const reorderItem = useMutation(api.prMergeQueue.reorder);

  const isLoading = queueItems === undefined;

  const handleCancel = async (queueId: Id<"prMergeQueue">) => {
    if (!confirm("Remove this PR from the merge queue?")) return;
    try {
      await cancelItem({ teamSlugOrId, queueId });
      toast.success("PR removed from queue");
    } catch (err) {
      console.error("Failed to cancel:", err);
      toast.error("Failed to remove from queue");
    }
  };

  const handleMoveUp = async (item: QueueItem) => {
    if (item.position === 0) return;
    try {
      await reorderItem({
        teamSlugOrId,
        queueId: item._id,
        newPosition: item.position - 1,
      });
    } catch (err) {
      console.error("Failed to reorder:", err);
      toast.error("Failed to reorder");
    }
  };

  const handleMoveDown = async (item: QueueItem, maxPosition: number) => {
    if (item.position >= maxPosition) return;
    try {
      await reorderItem({
        teamSlugOrId,
        queueId: item._id,
        newPosition: item.position + 1,
      });
    } catch (err) {
      console.error("Failed to reorder:", err);
      toast.error("Failed to reorder");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  const activeItems = queueItems?.filter(
    (item) => !["merged", "cancelled", "failed"].includes(item.status)
  ) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Merge Queue</h2>
          <p className="text-sm text-neutral-500">
            PRs waiting to be merged after code review
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? "Hide History" : "Show History"}
        </Button>
      </div>

      {activeItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <GitMerge className="w-12 h-12 mx-auto text-neutral-400 mb-4" />
            <h3 className="font-medium mb-2">No PRs in queue</h3>
            <p className="text-sm text-neutral-500">
              Complete a code review and enable "Queue for merge" to add PRs here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeItems.map((item) => (
            <Card key={item._id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="text-neutral-400 font-mono text-sm">
                        #{item.position + 1}
                      </span>
                      {item.prTitle ?? `PR #${item.prNumber}`}
                      <StatusBadge status={item.status} />
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {item.repoFullName} • PR #{item.prNumber}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.status === "queued" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleMoveUp(item)}
                          disabled={item.position === 0}
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleMoveDown(item, activeItems.length - 1)}
                          disabled={item.position >= activeItems.length - 1}
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <a
                      href={item.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                      title="View PR"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    {!["merged", "cancelled"].includes(item.status) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => handleCancel(item._id)}
                        title="Remove from queue"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  <RiskIndicator score={item.riskScore} />
                  <span>Added {formatRelativeTime(item.createdAt)}</span>
                  {item.errorMessage && (
                    <span className="text-red-500">{item.errorMessage}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showHistory && historyItems && historyItems.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-neutral-500 mb-3">
            Recently Merged
          </h3>
          <div className="space-y-2">
            {historyItems.map((item) => (
              <div
                key={item._id}
                className="flex items-center justify-between p-3 rounded-lg bg-neutral-50 dark:bg-neutral-900 text-sm"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>{item.prTitle ?? `PR #${item.prNumber}`}</span>
                  <span className="text-neutral-400">{item.repoFullName}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  {item.mergedAt && (
                    <span>Merged {formatRelativeTime(item.mergedAt)}</span>
                  )}
                  <a
                    href={item.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    View PR
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
