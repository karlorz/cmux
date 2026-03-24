import { Activity, Zap, ShieldCheck, AlertTriangle } from "lucide-react";
import clsx from "clsx";

interface EventAnalytics {
  totalEvents: number;
  countsByType: Record<string, number>;
  categories: {
    taskLifecycle: number;
    sessionLifecycle: number;
    approvals: number;
    contextHealth: number;
  };
  sinceTimestamp: number;
}

interface OrchestrationEventAnalyticsProps {
  analytics?: EventAnalytics;
  loading: boolean;
}

const CATEGORY_CARDS = [
  {
    key: "taskLifecycle",
    label: "Task Events",
    icon: Zap,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    key: "sessionLifecycle",
    label: "Session Events",
    icon: Activity,
    color: "text-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
  },
  {
    key: "approvals",
    label: "Approvals",
    icon: ShieldCheck,
    color: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
  },
  {
    key: "contextHealth",
    label: "Context Health",
    icon: AlertTriangle,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-900/20",
  },
] as const;

export function OrchestrationEventAnalytics({
  analytics,
  loading,
}: OrchestrationEventAnalyticsProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-3 h-5 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORY_CARDS.map((card) => (
            <div
              key={card.key}
              className="animate-pulse rounded-md bg-neutral-100 p-3 dark:bg-neutral-800"
            >
              <div className="mb-2 h-4 w-16 rounded bg-neutral-200 dark:bg-neutral-700" />
              <div className="h-6 w-10 rounded bg-neutral-200 dark:bg-neutral-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const timeRangeLabel = getTimeRangeLabel(analytics.sinceTimestamp);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Event Analytics
        </h3>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {timeRangeLabel} · {analytics.totalEvents} total
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CATEGORY_CARDS.map((card) => {
          const count =
            analytics.categories[
              card.key as keyof typeof analytics.categories
            ] ?? 0;
          const Icon = card.icon;

          return (
            <div
              key={card.key}
              className={clsx("rounded-md p-3", card.bgColor)}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={clsx("size-3.5", card.color)} />
                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {card.label}
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getTimeRangeLabel(sinceTimestamp: number): string {
  const hours = Math.round((Date.now() - sinceTimestamp) / (1000 * 60 * 60));
  if (hours <= 1) return "Last hour";
  if (hours <= 24) return `Last ${hours}h`;
  const days = Math.round(hours / 24);
  return `Last ${days}d`;
}
