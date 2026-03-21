import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileEdit,
  FileSearch,
  Terminal,
  GitCommit,
  AlertTriangle,
  Brain,
  Wrench,
  Search,
  X,
  Download,
  Filter,
} from "lucide-react";
import { ActivityStreamSkeleton } from "@/components/dashboard/DashboardSkeletons";

const ACTIVITY_TYPES = [
  "file_edit",
  "file_read",
  "bash_command",
  "git_commit",
  "error",
  "thinking",
  "test_run",
  "tool_call",
] as const;

type ActivityType = (typeof ACTIVITY_TYPES)[number];

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

const ACTIVITY_COLORS: Record<string, string> = {
  file_edit: "text-blue-500 dark:text-blue-400",
  file_read: "text-neutral-500 dark:text-neutral-400",
  bash_command: "text-green-600 dark:text-green-400",
  git_commit: "text-purple-500 dark:text-purple-400",
  error: "text-red-500 dark:text-red-400",
  thinking: "text-neutral-400 dark:text-neutral-500",
  test_run: "text-amber-500 dark:text-amber-400",
  tool_call: "text-neutral-500 dark:text-neutral-400",
};

const ACTIVITY_LABELS: Record<string, string> = {
  file_edit: "File Edit",
  file_read: "File Read",
  bash_command: "Command",
  git_commit: "Git Commit",
  error: "Error",
  thinking: "Thinking",
  test_run: "Test",
  tool_call: "Tool",
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

interface ActivityStreamProps {
  taskRunId: Id<"taskRuns">;
}

export function ActivityStream({ taskRunId }: ActivityStreamProps) {
  const activities = useQuery(api.taskRunActivity.getByTaskRunAsc, {
    taskRunId,
    limit: 200,
  });
  const [pinToBottom, setPinToBottom] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<ActivityType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter and search activities
  const filteredActivities = useMemo(() => {
    if (!activities) return [];

    let result = activities;

    // Apply type filters
    if (activeFilters.size > 0) {
      result = result.filter((a) => activeFilters.has(a.type as ActivityType));
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.summary.toLowerCase().includes(query) ||
          a.toolName?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [activities, activeFilters, searchQuery]);

  // Auto-scroll effect
  useEffect(() => {
    if (pinToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredActivities, pinToBottom]);

  // Toggle filter
  const toggleFilter = useCallback((type: ActivityType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setActiveFilters(new Set());
    setSearchQuery("");
  }, []);

  // Export as JSON
  const exportAsJson = useCallback(() => {
    if (!filteredActivities.length) return;

    const exportData = filteredActivities.map((a) => ({
      type: a.type,
      summary: a.summary,
      toolName: a.toolName,
      createdAt: formatTimestamp(a.createdAt),
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-${taskRunId}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredActivities, taskRunId]);

  // Export as CSV
  const exportAsCsv = useCallback(() => {
    if (!filteredActivities.length) return;

    const headers = ["Type", "Summary", "Tool", "Timestamp"];
    const rows = filteredActivities.map((a) => [
      a.type,
      `"${a.summary.replace(/"/g, '""')}"`,
      a.toolName ?? "",
      formatTimestamp(a.createdAt),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-${taskRunId}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredActivities, taskRunId]);

  // Loading state
  if (!activities) {
    return <ActivityStreamSkeleton />;
  }

  // Empty state (no activities at all)
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-500 dark:text-neutral-400">
        <Wrench className="h-8 w-8 opacity-50" />
        <p className="text-sm">No activity events yet</p>
        <p className="text-xs">Events will appear here as the agent works</p>
      </div>
    );
  }

  // Stats
  const editCount = activities.filter((a) => a.type === "file_edit").length;
  const commandCount = activities.filter((a) => a.type === "bash_command").length;
  const errorCount = activities.filter((a) => a.type === "error").length;

  const hasActiveFilters = activeFilters.size > 0 || searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {errorCount > 0 && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            {errorCount} error{errorCount > 1 ? "s" : ""} encountered
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-800">
        {/* Stats and actions row */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              {hasActiveFilters
                ? `${filteredActivities.length}/${activities.length}`
                : activities.length}{" "}
              events
            </span>
            {editCount > 0 && (
              <span className="text-blue-600 dark:text-blue-400">
                {editCount} edit{editCount > 1 ? "s" : ""}
              </span>
            )}
            {commandCount > 0 && (
              <span className="text-green-600 dark:text-green-400">
                {commandCount} cmd{commandCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded transition-colors ${
                showFilters || activeFilters.size > 0
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
              title="Filter by type"
            >
              <Filter className="h-3.5 w-3.5" />
            </button>

            {/* Export dropdown */}
            <div className="relative group">
              <button
                className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Export"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10">
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg py-1 min-w-[100px]">
                  <button
                    onClick={exportAsJson}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={exportAsCsv}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setPinToBottom(!pinToBottom)}
              className={`text-xs px-2 py-0.5 rounded ${
                pinToBottom
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {pinToBottom ? "Auto-scroll ON" : "Auto-scroll OFF"}
            </button>
          </div>
        </div>

        {/* Search and filters row */}
        {showFilters && (
          <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search activities..."
                className="w-full h-7 pl-7 pr-7 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Type filter chips */}
            <div className="flex flex-wrap gap-1">
              {ACTIVITY_TYPES.map((type) => {
                const Icon = ACTIVITY_ICONS[type];
                const isActive = activeFilters.has(type);
                const count = activities.filter((a) => a.type === type).length;
                if (count === 0) return null;

                return (
                  <button
                    key={type}
                    onClick={() => toggleFilter(type)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                      isActive
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {ACTIVITY_LABELS[type]} ({count})
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Activity list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          if (!scrollRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
          if (isAtBottom !== pinToBottom) setPinToBottom(isAtBottom);
        }}
      >
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
            <Search className="h-6 w-6 opacity-50 mb-2" />
            <p className="text-sm">No matching activities</p>
            <button
              onClick={clearFilters}
              className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {filteredActivities.map((activity) => {
              const Icon = ACTIVITY_ICONS[activity.type] ?? Wrench;
              const colorClass = ACTIVITY_COLORS[activity.type] ?? "text-neutral-500";
              const isError = activity.type === "error";

              return (
                <div
                  key={activity._id}
                  className={`flex items-start gap-2 px-3 py-2 ${
                    isError
                      ? "bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                  }`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-800 dark:text-neutral-200 truncate">
                      {activity.summary}
                    </p>
                    {activity.toolName && activity.toolName !== activity.summary && (
                      <p className="text-xs text-neutral-400 dark:text-neutral-600">
                        {activity.toolName}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400 dark:text-neutral-600 flex-shrink-0 whitespace-nowrap">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
