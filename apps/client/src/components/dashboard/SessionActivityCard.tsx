import { api } from "@cmux/convex/api";
import { useQuery as useConvexQuery } from "convex/react";
import { GitCommit, GitPullRequest, FileCode, Plus, Minus, Clock } from "lucide-react";
import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { SessionActivityCardSkeleton } from "./DashboardSkeletons";

const TIME_RANGES = [7, 14, 30] as const;
type TimeRange = (typeof TIME_RANGES)[number];

interface SessionActivityCardProps {
  teamSlugOrId: string;
  days?: number;
  className?: string;
}

function StatItem({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("size-4", color || "text-neutral-500 dark:text-neutral-400")} />
      <div className="flex flex-col">
        <span className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {value}
        </span>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{label}</span>
      </div>
    </div>
  );
}

function SessionActivityCardContent({ teamSlugOrId, days = 7 }: SessionActivityCardProps) {
  const stats = useConvexQuery(api.sessionActivity.getTeamStats, {
    teamSlugOrId,
    days,
  });

  if (!stats) {
    return <SessionActivityCardSkeleton className="border-0 p-0" />;
  }

  if (stats.totalSessions === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <GitCommit className="size-8 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No session activity in the last {days} days
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatItem
        icon={Clock}
        value={stats.totalSessions}
        label="Sessions"
        color="text-blue-500"
      />
      <StatItem
        icon={GitCommit}
        value={stats.totalCommits}
        label="Commits"
        color="text-purple-500"
      />
      <StatItem
        icon={GitPullRequest}
        value={stats.totalPRs}
        label="PRs Merged"
        color="text-green-500"
      />
      <StatItem
        icon={FileCode}
        value={stats.totalAdditions + stats.totalDeletions}
        label="Lines Changed"
        color="text-amber-500"
      />
      <StatItem
        icon={Plus}
        value={stats.totalAdditions.toLocaleString()}
        label="Additions"
        color="text-emerald-500"
      />
      <StatItem
        icon={Minus}
        value={stats.totalDeletions.toLocaleString()}
        label="Deletions"
        color="text-red-500"
      />
    </div>
  );
}

export const SessionActivityCard = memo(function SessionActivityCard({
  teamSlugOrId,
  days: initialDays = 7,
  className,
}: SessionActivityCardProps) {
  const [selectedDays, setSelectedDays] = useState<TimeRange>(
    TIME_RANGES.includes(initialDays as TimeRange) ? (initialDays as TimeRange) : 7
  );

  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Session Activity
        </h3>
        <div className="flex items-center gap-1">
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setSelectedDays(range)}
              className={cn(
                "px-2 py-0.5 text-xs rounded transition-colors",
                selectedDays === range
                  ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              )}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>
      <SessionActivityCardContent teamSlugOrId={teamSlugOrId} days={selectedDays} />
    </div>
  );
});
