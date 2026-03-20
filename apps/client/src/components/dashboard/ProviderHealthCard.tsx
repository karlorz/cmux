/**
 * ProviderHealthCard Component
 *
 * Displays real-time health status for sandbox providers.
 * Shows: provider name, status (healthy/degraded/down), and latency.
 */

import { Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { useState, useCallback } from "react";

type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

interface ProviderHealth {
  providerId: string;
  displayName: string;
  status: HealthStatus;
  latencyMs?: number;
  lastChecked?: number;
  error?: string;
}

interface ProviderHealthCardProps {
  teamSlugOrId: string;
  /** Manually provided health data (for testing or direct integration) */
  providers?: ProviderHealth[];
  onRefresh?: () => Promise<void>;
}

const STATUS_CONFIG: Record<HealthStatus, {
  icon: typeof CheckCircle;
  color: string;
  bgColor: string;
  label: string;
}> = {
  healthy: {
    icon: CheckCircle,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Healthy",
  },
  degraded: {
    icon: AlertTriangle,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    label: "Degraded",
  },
  down: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    label: "Down",
  },
  unknown: {
    icon: Activity,
    color: "text-neutral-500 dark:text-neutral-400",
    bgColor: "bg-neutral-100 dark:bg-neutral-800",
    label: "Unknown",
  },
};

export function ProviderHealthCard({
  teamSlugOrId: _teamSlugOrId,
  providers = [],
  onRefresh,
}: ProviderHealthCardProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      console.error("Failed to refresh provider health:", error);
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  // Calculate overall status
  const hasDown = providers.some((p) => p.status === "down");
  const hasDegraded = providers.some((p) => p.status === "degraded");
  const overallStatus: HealthStatus = hasDown
    ? "down"
    : hasDegraded
      ? "degraded"
      : providers.length > 0
        ? "healthy"
        : "unknown";
  const overallConfig = STATUS_CONFIG[overallStatus];

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-neutral-500" />
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            Provider Health
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${overallConfig.bgColor} ${overallConfig.color}`}
          >
            <overallConfig.icon className="size-3" />
            {overallConfig.label}
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                className={`size-4 text-neutral-400 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {providers.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No providers configured
        </p>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => {
            const config = STATUS_CONFIG[provider.status];
            const Icon = config.icon;

            return (
              <div
                key={provider.providerId}
                className="flex items-center justify-between py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Icon className={`size-4 ${config.color}`} />
                  <div>
                    <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {provider.displayName}
                    </span>
                    {provider.error && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-[200px] truncate">
                        {provider.error}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  {provider.latencyMs !== undefined && (
                    <span>{provider.latencyMs}ms</span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded ${config.bgColor} ${config.color}`}
                  >
                    {config.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Last updated footer */}
      {providers.length > 0 && providers[0].lastChecked && (
        <p className="text-xs text-neutral-400 mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          Last checked: {new Date(providers[0].lastChecked).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
