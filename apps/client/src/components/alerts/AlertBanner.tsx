/**
 * AlertBanner Component
 *
 * Displays active alerts at the top of the page with severity-based styling.
 * Supports dismissal, acknowledgement, and navigation to alert details.
 *
 * Note: Uses convex/react hooks directly. Wire up to api.alerts once the
 * Convex functions are deployed and API types are regenerated.
 */

import { AlertTriangle, Bell, CheckCircle, Info, X, XCircle } from "lucide-react";
import { useState } from "react";

// Type definitions for alerts (matches Convex schema)
type AlertSeverity = "info" | "warning" | "error" | "critical";

interface Alert {
  _id: string;
  alertId: string;
  teamId: string;
  userId?: string;
  severity: AlertSeverity;
  category: "sandbox" | "provider" | "orchestration" | "auth" | "system";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  resolvedAt?: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  createdAt: number;
}

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    icon: typeof Info;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  info: {
    icon: Info,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/30",
    borderColor: "border-yellow-200 dark:border-yellow-800",
  },
  error: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-200 dark:border-red-800",
  },
  critical: {
    icon: XCircle,
    color: "text-red-700 dark:text-red-300",
    bgColor: "bg-red-100 dark:bg-red-900/40",
    borderColor: "border-red-300 dark:border-red-700",
  },
};

interface AlertBannerProps {
  teamSlugOrId: string;
  maxAlerts?: number;
  /** Manually provided alerts (for testing or when API isn't available yet) */
  alerts?: Alert[];
  onAcknowledge?: (alertId: string) => Promise<void>;
  onResolve?: (alertId: string) => Promise<void>;
}

export function AlertBanner({
  teamSlugOrId: _teamSlugOrId,
  maxAlerts = 3,
  alerts: providedAlerts,
  onAcknowledge,
  onResolve,
}: AlertBannerProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Use provided alerts or empty array (wire to Convex query when API is ready)
  const alerts = (providedAlerts ?? [])
    .filter((a) => !dismissedIds.has(a._id))
    .slice(0, maxAlerts);

  if (alerts.length === 0) {
    return null;
  }

  const handleDismiss = (alertId: string) => {
    setDismissedIds((prev) => new Set([...prev, alertId]));
  };

  const handleAcknowledge = async (alert: Alert) => {
    if (onAcknowledge) {
      try {
        await onAcknowledge(alert._id);
      } catch (error) {
        console.error("Failed to acknowledge alert:", error);
      }
    }
  };

  const handleResolve = async (alert: Alert) => {
    if (onResolve) {
      try {
        await onResolve(alert._id);
      } catch (error) {
        console.error("Failed to resolve alert:", error);
      }
    }
  };

  return (
    <div className="space-y-2 px-4 pt-2">
      {alerts.map((alert) => {
        const config = SEVERITY_CONFIG[alert.severity];
        const Icon = config.icon;

        return (
          <div
            key={alert._id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${config.bgColor} ${config.borderColor}`}
          >
            <Icon className={`mt-0.5 size-5 shrink-0 ${config.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${config.color}`}>
                  {alert.title}
                </span>
                {alert.acknowledgedAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
                    <CheckCircle className="size-3" />
                    Acknowledged
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5 line-clamp-2">
                {alert.message}
              </p>
              <div className="flex items-center gap-3 mt-2">
                {!alert.acknowledgedAt && onAcknowledge && (
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(alert)}
                    className="text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                  >
                    Acknowledge
                  </button>
                )}
                {onResolve && (
                  <button
                    type="button"
                    onClick={() => handleResolve(alert)}
                    className="text-xs font-medium text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                  >
                    Resolve
                  </button>
                )}
                <span className="text-xs text-neutral-400">
                  {new Date(alert.createdAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDismiss(alert._id)}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
              title="Dismiss"
            >
              <X className="size-4 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact alert indicator for header/nav
 */
interface AlertIndicatorProps {
  teamSlugOrId: string;
  /** Manually provided counts (for testing or when API isn't available yet) */
  counts?: { info: number; warning: number; error: number; critical: number };
}

export function AlertIndicator({ teamSlugOrId: _teamSlugOrId, counts }: AlertIndicatorProps) {
  // Use provided counts or default to empty
  if (!counts) return null;

  const total = counts.critical + counts.error + counts.warning + counts.info;
  if (total === 0) return null;

  const hasHighPriority = counts.critical > 0 || counts.error > 0;

  return (
    <div className="relative">
      <Bell
        className={`size-5 ${
          hasHighPriority
            ? "text-red-500"
            : "text-yellow-500"
        }`}
      />
      <span
        className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white rounded-full ${
          hasHighPriority
            ? "bg-red-500"
            : "bg-yellow-500"
        }`}
      >
        {total > 99 ? "99+" : total}
      </span>
    </div>
  );
}
