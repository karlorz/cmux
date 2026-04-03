import { useQuery } from "@tanstack/react-query";
import { Monitor, Play, CheckCircle2, XCircle, Clock, RefreshCw } from "lucide-react";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";

interface LocalRun {
  id: string;
  runId?: string;
  agent: string;
  status: "running" | "completed" | "failed" | "unknown";
  prompt?: string;
  createdAt?: string;
  completedAt?: string;
  workspace?: string;
}

interface LocalRunsResponse {
  runs: LocalRun[];
  count: number;
}

const STATUS_CONFIG = {
  running: {
    icon: Play,
    label: "Running",
    className: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30",
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    className: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    className: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30",
  },
  unknown: {
    icon: Clock,
    label: "Unknown",
    className: "text-neutral-600 bg-neutral-100 dark:text-neutral-400 dark:bg-neutral-800",
  },
} as const;

function LocalRunRow({ run }: { run: LocalRun }) {
  const statusConfig = STATUS_CONFIG[run.status] || STATUS_CONFIG.unknown;
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex items-center gap-4 border-b border-neutral-100 px-4 py-3 last:border-b-0 dark:border-neutral-800">
      <div className="flex items-center gap-2">
        <Monitor className="size-4 text-neutral-400" />
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}
        >
          <StatusIcon className="size-3" />
          {statusConfig.label}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {run.id}
          </span>
          <span className="text-xs text-neutral-500">{run.agent}</span>
        </div>
        {run.prompt && (
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {run.prompt}
          </p>
        )}
      </div>

      {run.createdAt && (
        <span className="text-xs text-neutral-400">
          {new Date(run.createdAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

interface LocalRunsListProps {
  teamSlugOrId: string;
}

export function LocalRunsList({ teamSlugOrId }: LocalRunsListProps) {
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<LocalRunsResponse>({
    queryKey: ["local-runs", teamSlugOrId],
    queryFn: async () => {
      const response = await fetch(
        `${WWW_ORIGIN}/api/orchestrate/list-local?teamSlugOrId=${teamSlugOrId}&limit=10`,
        { credentials: "include" }
      );
      if (!response.ok) {
        // Return empty if endpoint not available
        if (response.status === 404) {
          return { runs: [], count: 0 };
        }
        throw new Error(`Failed to fetch local runs: ${response.status}`);
      }
      return response.json();
    },
    refetchInterval: 10000, // Poll every 10 seconds
    staleTime: 5000,
  });

  const runs = data?.runs ?? [];

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
        Local runs unavailable
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-neutral-500">
        <Monitor className="size-8 text-neutral-300 dark:text-neutral-600" />
        No local runs yet
        <p className="text-xs">
          Use the Spawn Agent dialog with "Local" venue to start a local run
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
        <span className="text-xs text-neutral-500">
          {runs.length} local run{runs.length !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 disabled:opacity-50 dark:hover:text-neutral-300"
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      {runs.map((run) => (
        <LocalRunRow key={run.id || run.runId} run={run} />
      ))}
    </div>
  );
}
