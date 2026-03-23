import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, RefreshCw, CheckCircle2, XCircle, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "@cmux/convex/dataModel";

interface ScheduledTaskRunHistoryProps {
  teamSlugOrId: string;
  scheduledTaskId: Id<"scheduledTasks">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { icon: React.ReactNode; className: string }> = {
    completed: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    failed: {
      icon: <XCircle className="w-3 h-3" />,
      className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    },
    running: {
      icon: <RefreshCw className="w-3 h-3 animate-spin" />,
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    },
    pending: {
      icon: <Clock className="w-3 h-3" />,
      className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    },
  };

  const variant = variants[status] ?? variants.pending;

  return (
    <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1 w-fit", variant.className)}>
      {variant.icon}
      {status}
    </span>
  );
}

export function ScheduledTaskRunHistory({
  teamSlugOrId,
  scheduledTaskId,
  open,
  onOpenChange,
}: ScheduledTaskRunHistoryProps) {
  const runs = useQuery(api.scheduledTasks.getRunHistory, { teamSlugOrId, scheduledTaskId, limit: 20 });
  const task = useQuery(api.scheduledTasks.get, { teamSlugOrId, scheduledTaskId });

  const isLoading = runs === undefined;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl max-h-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden flex flex-col">
          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <X className="size-4" />
            </button>
          </Dialog.Close>

          <Dialog.Title className="text-lg font-semibold">
            Run History: {task?.name ?? "Loading..."}
          </Dialog.Title>

          <div className="mt-4 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
              </div>
            ) : !runs || runs.length === 0 ? (
              <div className="py-12 text-center text-neutral-500">
                <Clock className="w-12 h-12 mx-auto mb-4 text-neutral-400" />
                <p>No runs yet</p>
                <p className="text-sm mt-1">Runs will appear here once the task executes</p>
              </div>
            ) : (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div
                    key={run._id}
                    className="p-3 rounded-lg border bg-neutral-50 dark:bg-neutral-900"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={run.status} />
                        {run.startedAt && (
                          <span className="text-xs text-neutral-500">
                            {formatTimestamp(run.startedAt)}
                          </span>
                        )}
                      </div>
                      {run.taskRunId && (
                        <a
                          href={`/runs/${run.taskRunId}`}
                          className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                        >
                          View run <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    <div className="text-xs text-neutral-500 space-y-1">
                      {run.completedAt && run.startedAt && (
                        <div>
                          Duration: {formatDuration(run.completedAt - run.startedAt)}
                        </div>
                      )}
                      {run.errorMessage && (
                        <div className="text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded mt-2">
                          {run.errorMessage}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
