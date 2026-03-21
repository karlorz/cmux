import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { memo, useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Cpu, HardDrive, RefreshCw } from "lucide-react";

type ResourceUsageCardProps = {
  taskRunId: Id<"taskRuns">;
};

function formatTime(timestamp: number, firstTimestamp: number): string {
  const elapsedMs = timestamp - firstTimestamp;
  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function ResourceUsageCardSkeleton() {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-4 w-4 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
      <div className="h-32 rounded bg-neutral-100 dark:bg-neutral-800" />
    </div>
  );
}

export const ResourceUsageCard = memo(function ResourceUsageCard({
  taskRunId,
}: ResourceUsageCardProps) {
  const metricsQuery = useQuery(
    convexQuery(api.taskRunResourceMetrics.getByTaskRun, { taskRunId })
  );

  const statsQuery = useQuery(
    convexQuery(api.taskRunResourceMetrics.getStatsByTaskRun, { taskRunId })
  );

  const chartData = useMemo(() => {
    if (!metricsQuery.data || metricsQuery.data.length === 0) {
      return [];
    }

    const firstTimestamp = metricsQuery.data[0].timestamp;
    return metricsQuery.data.map((m) => ({
      time: formatTime(m.timestamp, firstTimestamp),
      timestamp: m.timestamp,
      cpu: Math.round(m.cpuPercent * 10) / 10,
      memory: Math.round(m.memoryMB),
      memoryPercent: Math.round(m.memoryPercent * 10) / 10,
    }));
  }, [metricsQuery.data]);

  if (metricsQuery.isLoading || statsQuery.isLoading) {
    return <ResourceUsageCardSkeleton />;
  }

  if (metricsQuery.isError || statsQuery.isError) {
    const message = metricsQuery.error?.message ?? statsQuery.error?.message ?? "Failed to load resource metrics";
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-medium">Failed to load resource metrics</p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void metricsQuery.refetch();
              void statsQuery.refetch();
            }}
            className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metricsQuery.data || metricsQuery.data.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 p-4">
        <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <HardDrive className="size-4" />
          <span className="text-sm">No resource metrics available</span>
        </div>
      </div>
    );
  }

  const stats = statsQuery.data;

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700/60 bg-white dark:bg-neutral-800/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <HardDrive className="size-4 text-neutral-500 dark:text-neutral-400" />
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Resource Usage
          </span>
        </div>
        {stats && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Duration: {formatDuration(stats.durationMs)}
          </span>
        )}
      </div>

      {/* Stats summary */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="size-3.5 text-blue-500" />
            <div className="text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">
                CPU:{" "}
              </span>
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                avg {stats.cpu.avg.toFixed(1)}%
              </span>
              <span className="text-neutral-400 dark:text-neutral-500">
                {" "}
                (max {stats.cpu.max.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="size-3.5 text-green-500" />
            <div className="text-xs">
              <span className="text-neutral-500 dark:text-neutral-400">
                Memory:{" "}
              </span>
              <span className="font-medium text-neutral-900 dark:text-neutral-100">
                avg {stats.memoryMB.avg.toFixed(0)} MB
              </span>
              <span className="text-neutral-400 dark:text-neutral-500">
                {" "}
                (max {stats.memoryMB.max.toFixed(0)} MB)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="memoryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              className="text-neutral-400 dark:text-neutral-500"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={30}
              tickFormatter={(value) => `${value}%`}
              domain={[0, 100]}
              className="text-neutral-400 dark:text-neutral-500"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--tooltip-bg, #1f2937)",
                border: "1px solid var(--tooltip-border, #374151)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#9ca3af" }}
              formatter={(value, name) => {
                const numValue = typeof value === "number" ? value : 0;
                const displayName = name === "cpu" ? "CPU" : "Memory";
                const formatted = name === "cpu" ? `${numValue}%` : `${numValue}%`;
                return [formatted, displayName];
              }}
            />
            <Area
              type="monotone"
              dataKey="cpu"
              stroke="#3b82f6"
              strokeWidth={1.5}
              fill="url(#cpuGradient)"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="memoryPercent"
              stroke="#22c55e"
              strokeWidth={1.5}
              fill="url(#memoryGradient)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-0.5 rounded-full bg-blue-500" />
          <span>CPU</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2.5 h-0.5 rounded-full bg-green-500" />
          <span>Memory</span>
        </div>
      </div>
    </div>
  );
});
