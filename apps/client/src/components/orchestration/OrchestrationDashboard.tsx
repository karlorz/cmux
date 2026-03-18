import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Users, Plus, List, GitBranch, Radio, Download } from "lucide-react";
import { OrchestrationSummaryCards } from "./OrchestrationSummaryCards";
import { OrchestrationTaskList } from "./OrchestrationTaskList";
import { OrchestrationSpawnDialog } from "./OrchestrationSpawnDialog";
import { OrchestrationDependencyGraph } from "./OrchestrationDependencyGraph";
import { OrchestrationEventStream } from "./OrchestrationEventStream";
import { STATUS_CONFIG, type TaskStatus } from "./status-config";
import type { Doc, Id } from "@cmux/convex/dataModel";

// Re-export for backward compatibility
export { STATUS_CONFIG, type TaskStatus } from "./status-config";

interface DependencyInfo {
  totalDeps: number;
  completedDeps: number;
  pendingDeps: number;
  blockedBy: Array<{
    _id: Id<"orchestrationTasks">;
    status: string;
    prompt: string;
  }>;
}

export interface OrchestrationTaskWithDeps extends Doc<"orchestrationTasks"> {
  dependencyInfo?: DependencyInfo;
}

interface OrchestrationSummary {
  totalTasks: number;
  statusCounts: Record<string, number>;
  activeAgentCount: number;
  activeAgents: string[];
  recentTasks: Array<{
    _id: Id<"orchestrationTasks">;
    prompt: string;
    status: string;
    assignedAgentName?: string;
    completedAt?: number;
    errorMessage?: string;
  }>;
}

interface OrchestrationDashboardProps {
  teamSlugOrId: string;
  summary?: OrchestrationSummary;
  summaryLoading: boolean;
  tasks?: OrchestrationTaskWithDeps[];
  tasksLoading: boolean;
  statusFilter: string;
  orchestrationId?: string;
}

export function OrchestrationDashboard({
  teamSlugOrId,
  summary,
  summaryLoading,
  tasks,
  tasksLoading,
  statusFilter,
  orchestrationId,
}: OrchestrationDashboardProps) {
  const navigate = useNavigate();
  const [spawnDialogOpen, setSpawnDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "graph">("list");
  const [showEventStream, setShowEventStream] = useState(!!orchestrationId);
  const [exporting, setExporting] = useState(false);

  const handleExportBundle = useCallback(async () => {
    if (!orchestrationId || exporting) return;
    setExporting(true);
    try {
      const response = await fetch(
        `/api/orchestrate/results/${orchestrationId}?teamSlugOrId=${teamSlugOrId}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      const results = await response.json();

      // Single-pass status counting
      const counts = { failed: 0, running: 0, pending: 0 };
      for (const t of results.results as { status: string }[]) {
        if (t.status === "failed") counts.failed++;
        else if (t.status === "running" || t.status === "assigned") counts.running++;
        else if (t.status === "pending") counts.pending++;
      }

      // Build export bundle matching CLI format
      const bundle = {
        exportedAt: new Date().toISOString(),
        version: "1.0.0",
        orchestration: {
          id: orchestrationId,
          status: results.status,
        },
        tasks: results.results,
        summary: {
          totalTasks: results.totalTasks,
          completedTasks: results.completedTasks,
          failedTasks: counts.failed,
          runningTasks: counts.running,
          pendingTasks: counts.pending,
        },
      };

      // Download as JSON file
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orchestration-${orchestrationId.slice(0, 8)}-bundle.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export bundle:", error);
    } finally {
      setExporting(false);
    }
  }, [orchestrationId, teamSlugOrId, exporting]);

  const handleStatusFilterChange = (status: string) => {
    void navigate({
      to: "/$teamSlugOrId/orchestration",
      params: { teamSlugOrId },
      search: { status: status === "all" ? undefined : status as TaskStatus },
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <Users className="size-5 text-neutral-500" />
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Agent Orchestration
          </h1>
          {summary && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {summary.totalTasks} tasks
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {orchestrationId && (
            <button
              type="button"
              onClick={() => void handleExportBundle()}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <Download className="size-4" />
              {exporting ? "Exporting..." : "Export Bundle"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSpawnDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <Plus className="size-4" />
            Spawn Agent
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Summary Cards */}
          <OrchestrationSummaryCards
            summary={summary}
            loading={summaryLoading}
            onFilterChange={handleStatusFilterChange}
            activeFilter={statusFilter}
          />

          {/* Event Stream (when orchestrationId provided) */}
          {orchestrationId && showEventStream && (
            <OrchestrationEventStream
              orchestrationId={orchestrationId}
              teamSlugOrId={teamSlugOrId}
              onClose={() => setShowEventStream(false)}
            />
          )}

          {/* Event Stream toggle (when orchestrationId provided but stream hidden) */}
          {orchestrationId && !showEventStream && (
            <button
              type="button"
              onClick={() => setShowEventStream(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 py-2 text-sm text-neutral-500 transition-colors hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
            >
              <Radio className="size-4" />
              Show Event Stream
            </button>
          )}

          {/* Active Agents */}
          {summary && summary.activeAgents.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Active Agents ({summary.activeAgentCount})
              </h3>
              <div className="flex flex-wrap gap-2">
                {summary.activeAgents.map((agent) => (
                  <span
                    key={agent}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
                    {agent}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Task List / Graph */}
          <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Tasks
              </h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                      viewMode === "list"
                        ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                    }`}
                    title="List view"
                  >
                    <List className="size-3.5" />
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("graph")}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                      viewMode === "graph"
                        ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
                        : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                    }`}
                    title="Dependency graph"
                  >
                    <GitBranch className="size-3.5" />
                    Graph
                  </button>
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilterChange(e.target.value)}
                  className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  <option value="all">All statuses</option>
                  {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {STATUS_CONFIG[status].label}
                      {summary ? ` (${summary.statusCounts[status] || 0})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {viewMode === "list" ? (
              <OrchestrationTaskList
                teamSlugOrId={teamSlugOrId}
                tasks={tasks}
                loading={tasksLoading}
              />
            ) : (
              <OrchestrationDependencyGraph
                tasks={tasks}
                loading={tasksLoading}
              />
            )}
          </div>
        </div>
      </div>

      {/* Spawn Dialog */}
      <OrchestrationSpawnDialog
        teamSlugOrId={teamSlugOrId}
        open={spawnDialogOpen}
        onOpenChange={setSpawnDialogOpen}
      />
    </div>
  );
}
