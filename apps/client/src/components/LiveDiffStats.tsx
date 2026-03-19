import { useLiveDiff } from "@/hooks/useLiveDiff";
import { GitBranch, Plus, Minus, FileText, RefreshCw, Loader2 } from "lucide-react";

interface LiveDiffStatsProps {
  sandboxId: string | undefined;
  isRunning: boolean;
}

/**
 * Shows live git diff stats from a running sandbox.
 * Displays file count, insertions, and deletions with auto-refresh.
 */
export function LiveDiffStats({ sandboxId, isRunning }: LiveDiffStatsProps) {
  const { data, isLoading, isFetching, refetch, error } = useLiveDiff({
    sandboxId,
    enabled: isRunning && Boolean(sandboxId),
    refetchInterval: isRunning ? 10_000 : false, // Refresh every 10s while running
  });

  if (!sandboxId || !isRunning) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/40">
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Loading live changes...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null; // Silently hide on error
  }

  const { summary, files } = data;

  if (summary.totalFiles === 0) {
    return (
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <GitBranch className="h-3.5 w-3.5" />
            <span>No uncommitted changes</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-neutral-400 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-blue-50/60 dark:bg-blue-950/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
            <FileText className="h-3.5 w-3.5" />
            <span className="font-medium">{summary.totalFiles} file{summary.totalFiles !== 1 ? "s" : ""}</span>
          </div>
          {summary.insertions > 0 && (
            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Plus className="h-3.5 w-3.5" />
              <span>{summary.insertions}</span>
            </div>
          )}
          {summary.deletions > 0 && (
            <div className="flex items-center gap-1 text-red-500 dark:text-red-400">
              <Minus className="h-3.5 w-3.5" />
              <span>{summary.deletions}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">Live</span>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-blue-500 dark:text-blue-400 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {/* Show first few changed files */}
      {files.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {files.slice(0, 5).map((file) => (
            <span
              key={file.path}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                file.status === "added" || file.status === "untracked"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  : file.status === "deleted"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              }`}
            >
              {file.path.split("/").pop()}
            </span>
          ))}
          {files.length > 5 && (
            <span className="text-[10px] px-1.5 py-0.5 text-neutral-500 dark:text-neutral-400">
              +{files.length - 5} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
