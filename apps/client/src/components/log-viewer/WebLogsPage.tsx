/**
 * WebLogsPage Component
 *
 * Web-based log viewing page for task run activity.
 * Provides:
 * - Real-time log streaming via Convex subscriptions
 * - Level filters (DEBUG, INFO, WARN, ERROR)
 * - Regex search with highlighting
 * - Export as JSON/CSV
 * - Auto-scroll with pause on interaction
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import type { LocalRunArtifactFeedEntry } from "@cmux/shared";
import {
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  FileEdit,
  FileSearch,
  Terminal,
  GitCommit,
  Brain,
  Wrench,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import clsx from "clsx";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogFilter } from "./LogFilter";
import {
  ACTIVITY_TYPE_CONFIG_META,
  INITIAL_FILTER_STATE,
  type ActivityType,
  type LogLevel,
  type LogFilterState,
} from "./log-constants";
import { filterLogs, highlightMatches } from "./log-utils";

const ACTIVITY_ICONS: Record<string, typeof FileEdit> = {
  file_edit: FileEdit,
  file_read: FileSearch,
  bash_command: Terminal,
  git_commit: GitCommit,
  error: AlertTriangle,
  thinking: Brain,
  test_run: Terminal,
  tool_call: Wrench,
};

// Get color from config meta
function getActivityColor(type: ActivityType): string {
  return ACTIVITY_TYPE_CONFIG_META[type]?.color ?? "text-neutral-500";
}

type WebLogsPageEntry = LocalRunArtifactFeedEntry;

interface WebLogsPageProps {
  taskRunId?: Id<"taskRuns">;
  teamId?: string;
  entries?: WebLogsPageEntry[];
}

interface LogEntry extends WebLogsPageEntry {}

function LogSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="size-4 mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-3 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function LogEntryRow({
  entry,
  searchQuery,
  isRegex,
  expanded,
  onToggle,
}: {
  entry: LogEntry;
  searchQuery: string;
  isRegex: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const Icon = ACTIVITY_ICONS[entry.type] ?? Wrench;
  const colorClass = getActivityColor(entry.type as ActivityType);
  const isError = entry.type === "error";

  const copyToClipboard = useCallback(() => {
    const text = entry.detail
      ? `${entry.summary}\n\n${entry.detail}`
      : entry.summary;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [entry]);

  return (
    <div
      className={clsx(
        "group border-b border-neutral-100 dark:border-neutral-800 last:border-0",
        isError && "bg-red-50/50 dark:bg-red-950/20"
      )}
    >
      {/* Main row */}
      <div
        className={clsx(
          "flex items-start gap-3 px-4 py-2.5",
          "hover:bg-neutral-50 dark:hover:bg-neutral-900/50",
          "cursor-pointer"
        )}
        onClick={onToggle}
      >
        {/* Icon */}
        <Icon className={clsx("size-4 mt-0.5 flex-shrink-0", colorClass)} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-800 dark:text-neutral-200">
            {highlightMatches(entry.summary, searchQuery, isRegex)}
          </p>
          {entry.toolName && entry.toolName !== entry.summary && (
            <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
              {highlightMatches(entry.toolName, searchQuery, isRegex)}
            </p>
          )}
        </div>

        {/* Duration badge */}
        {entry.durationMs !== undefined && entry.durationMs > 0 && (
          <span className="text-xs text-neutral-400 dark:text-neutral-500 flex items-center gap-1">
            <Clock className="size-3" />
            {entry.durationMs < 1000
              ? `${entry.durationMs}ms`
              : `${(entry.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}

        {/* Timestamp */}
        <span className="text-xs text-neutral-400 dark:text-neutral-500 flex-shrink-0 whitespace-nowrap font-mono">
          {format(new Date(entry.createdAt), "HH:mm:ss.SSS")}
        </span>

        {/* Expand indicator */}
        {entry.detail && (
          <button
            type="button"
            className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && entry.detail && (
        <div className="px-4 pb-3 pl-11">
          <div className="relative rounded-lg bg-neutral-100 dark:bg-neutral-800 p-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard();
              }}
              className="absolute top-2 right-2 p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="size-3.5 text-green-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
            <pre className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words font-mono overflow-x-auto">
              {highlightMatches(entry.detail, searchQuery, isRegex)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function WebLogsPage({ taskRunId, entries }: WebLogsPageProps) {
  const [filterState, setFilterState] = useState<LogFilterState>(INITIAL_FILTER_STATE);
  const [pinToBottom, setPinToBottom] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch logs via Convex subscription
  const queriedLogs = useQuery(
    api.taskRunActivity.getByTaskRunAsc,
    entries ? "skip" : taskRunId ? { taskRunId, limit: 1000 } : "skip"
  );
  const logs = entries ?? queriedLogs;

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return filterLogs(logs as LogEntry[], filterState);
  }, [logs, filterState]);

  // Calculate counts for filter badges
  const typeCounts = useMemo(() => {
    if (!logs) return {} as Record<ActivityType, number>;
    const counts: Record<string, number> = {};
    for (const log of logs) {
      counts[log.type] = (counts[log.type] || 0) + 1;
    }
    return counts as Record<ActivityType, number>;
  }, [logs]);

  // Map activity types to log levels for level counts
  const levelCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
    };
    if (!logs) return counts;
    for (const log of logs) {
      if (log.type === "error") {
        counts.ERROR++;
      } else if (log.type === "thinking") {
        counts.DEBUG++;
      } else {
        counts.INFO++;
      }
    }
    return counts;
  }, [logs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (pinToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, pinToBottom]);

  // Handle scroll to detect user interaction
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    if (isAtBottom !== pinToBottom) {
      setPinToBottom(isAtBottom);
    }
  }, [pinToBottom]);

  // Toggle expanded state
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Export as JSON
  const exportAsJson = useCallback(() => {
    if (!filteredLogs.length) return;

    const exportData = filteredLogs.map((log) => ({
      type: log.type,
      summary: log.summary,
      toolName: log.toolName,
      detail: log.detail,
      durationMs: log.durationMs,
      timestamp: new Date(log.createdAt).toISOString(),
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `logs-${taskRunId ?? "local-run"}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs, taskRunId]);

  // Export as CSV
  const exportAsCsv = useCallback(() => {
    if (!filteredLogs.length) return;

    const headers = ["Timestamp", "Type", "Summary", "Tool", "Duration (ms)", "Detail"];
    const rows = filteredLogs.map((log) => [
      new Date(log.createdAt).toISOString(),
      log.type,
      `"${log.summary.replace(/"/g, '""')}"`,
      log.toolName ?? "",
      log.durationMs?.toString() ?? "",
      log.detail ? `"${log.detail.replace(/"/g, '""')}"` : "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `logs-${taskRunId ?? "local-run"}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs, taskRunId]);

  // Loading state
  if (logs === undefined) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
          <Skeleton className="h-10 w-full" />
        </div>
        <LogSkeleton />
      </div>
    );
  }

  // Empty state
  if (logs.length === 0) {
    return (
      <div className="flex flex-col h-full bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-500 dark:text-neutral-400">
          <Terminal className="size-10 opacity-50" />
          <p className="text-sm font-medium">No logs yet</p>
          <p className="text-xs">Logs will appear here as the agent works</p>
        </div>
      </div>
    );
  }

  const errorCount = logs.filter((l) => l.type === "error").length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800">
      {/* Error banner */}
      {errorCount > 0 && (
        <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 flex items-center gap-2">
          <AlertTriangle className="size-4 text-red-500" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            {errorCount} error{errorCount > 1 ? "s" : ""} in logs
          </span>
          <button
            type="button"
            onClick={() => {
              setFilterState({
                ...filterState,
                types: new Set(["error"]),
              });
            }}
            className="text-xs text-red-600 dark:text-red-400 hover:underline ml-auto"
          >
            Show only errors
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
        <LogFilter
          filterState={filterState}
          onFilterChange={setFilterState}
          totalCount={logs.length}
          filteredCount={filteredLogs.length}
          levelCounts={levelCounts}
          typeCounts={typeCounts}
        />

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
          {/* Auto-scroll toggle */}
          <button
            type="button"
            onClick={() => setPinToBottom(!pinToBottom)}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
              pinToBottom
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
            )}
          >
            <RefreshCw className={clsx("size-3.5", pinToBottom && "animate-spin")} />
            Auto-scroll {pinToBottom ? "ON" : "OFF"}
          </button>

          <div className="flex-1" />

          {/* Export buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={exportAsJson}
              disabled={filteredLogs.length === 0}
            >
              <Download className="size-3.5 mr-1.5" />
              JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportAsCsv}
              disabled={filteredLogs.length === 0}
            >
              <Download className="size-3.5 mr-1.5" />
              CSV
            </Button>
          </div>
        </div>
      </div>

      {/* Log list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
            <Terminal className="size-8 opacity-50 mb-2" />
            <p className="text-sm">No logs match your filters</p>
            <button
              type="button"
              onClick={() =>
                setFilterState({
                  searchQuery: "",
                  isRegex: false,
                  regexError: null,
                  levels: new Set(),
                  types: new Set(),
                  startTime: null,
                  endTime: null,
                })
              }
              className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div>
            {filteredLogs.map((entry) => (
              <LogEntryRow
                key={entry._id}
                entry={entry as LogEntry}
                searchQuery={filterState.searchQuery}
                isRegex={filterState.isRegex}
                expanded={expandedIds.has(entry._id)}
                onToggle={() => toggleExpanded(entry._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-4">
        <span>
          {filteredLogs.length === logs.length
            ? `${logs.length} total entries`
            : `${filteredLogs.length} of ${logs.length} entries`}
        </span>
        {logs.length > 0 && (
          <>
            <span className="text-neutral-300 dark:text-neutral-600">|</span>
            <span>
              First: {format(new Date(logs[0].createdAt), "HH:mm:ss")}
            </span>
            <span>
              Last: {format(new Date(logs[logs.length - 1].createdAt), "HH:mm:ss")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
