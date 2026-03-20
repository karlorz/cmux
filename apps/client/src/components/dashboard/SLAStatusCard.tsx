/**
 * SLAStatusCard Component
 *
 * Displays SLA metrics for a team including:
 * - Sandbox spawn latency (P95)
 * - Task completion rate
 * - Provider uptime
 *
 * Note: Wire to api.slaMetrics once Convex functions are deployed.
 */

import { Activity, CheckCircle, Clock, TrendingDown, TrendingUp } from "lucide-react";

interface SLAStatusCardProps {
  teamSlugOrId: string;
  /** Manually provided metrics (for testing or when API isn't available yet) */
  metrics?: {
    sandbox_spawn_p95?: number;
    task_completion_rate?: number;
    provider_uptime?: number;
    timestamp?: number;
  };
}

interface MetricDisplay {
  name: string;
  value: number | undefined;
  unit: string;
  icon: typeof Activity;
  target?: number;
  higherIsBetter?: boolean;
}

export function SLAStatusCard({ teamSlugOrId: _teamSlugOrId, metrics }: SLAStatusCardProps) {
  const displayMetrics: MetricDisplay[] = [
    {
      name: "Spawn Latency (P95)",
      value: metrics?.sandbox_spawn_p95,
      unit: "ms",
      icon: Clock,
      target: 30000, // 30s target
      higherIsBetter: false,
    },
    {
      name: "Task Completion",
      value: metrics?.task_completion_rate,
      unit: "%",
      icon: CheckCircle,
      target: 95,
      higherIsBetter: true,
    },
    {
      name: "Provider Uptime",
      value: metrics?.provider_uptime,
      unit: "%",
      icon: Activity,
      target: 99.5,
      higherIsBetter: true,
    },
  ];

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="size-5 text-neutral-500" />
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
          SLA Status
        </h3>
        {metrics?.timestamp && (
          <span className="ml-auto text-xs text-neutral-400">
            Updated {new Date(metrics.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {displayMetrics.map((metric) => {
          const Icon = metric.icon;
          const value = metric.value;
          const isWithinTarget =
            value !== undefined && metric.target !== undefined
              ? metric.higherIsBetter
                ? value >= metric.target
                : value <= metric.target
              : undefined;

          return (
            <div
              key={metric.name}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-neutral-400" />
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {metric.name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {value !== undefined ? (
                  <>
                    <span
                      className={`text-sm font-medium ${
                        isWithinTarget === true
                          ? "text-green-600 dark:text-green-400"
                          : isWithinTarget === false
                            ? "text-red-600 dark:text-red-400"
                            : "text-neutral-900 dark:text-neutral-100"
                      }`}
                    >
                      {metric.unit === "ms"
                        ? `${(value / 1000).toFixed(1)}s`
                        : `${value.toFixed(1)}${metric.unit}`}
                    </span>
                    {isWithinTarget !== undefined && (
                      isWithinTarget ? (
                        <TrendingUp className="size-4 text-green-500" />
                      ) : (
                        <TrendingDown className="size-4 text-red-500" />
                      )
                    )}
                  </>
                ) : (
                  <span className="text-sm text-neutral-400">--</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Target Reference */}
      <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
        <p className="text-xs text-neutral-400">
          Targets: Spawn &lt;30s, Completion &gt;95%, Uptime &gt;99.5%
        </p>
      </div>
    </div>
  );
}
