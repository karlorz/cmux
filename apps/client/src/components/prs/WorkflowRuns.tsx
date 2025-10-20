import clsx from "clsx";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import { useMemo } from "react";
import type { CombinedRun } from "./useCombinedWorkflowData";

export function WorkflowRuns({
  allRuns,
  isLoading,
}: {
  allRuns: CombinedRun[];
  isLoading: boolean;
}) {
  if (isLoading || allRuns.length === 0) {
    return null;
  }

  const hasAnyRunning = allRuns.some(
    (run) =>
      run.status === "in_progress" ||
      run.status === "queued" ||
      run.status === "waiting" ||
      run.status === "pending",
  );
  const hasAnyFailure = allRuns.some(
    (run) =>
      run.conclusion === "failure" ||
      run.conclusion === "timed_out" ||
      run.conclusion === "action_required",
  );
  const allPassed =
    allRuns.length > 0 &&
    allRuns.every(
      (run) =>
        run.conclusion === "success" ||
        run.conclusion === "neutral" ||
        run.conclusion === "skipped",
    );

  const { icon, colorClass, statusText } = hasAnyRunning
    ? {
        icon: <Clock className="w-[10px] h-[10px] animate-pulse" />,
        colorClass: "text-yellow-600 dark:text-yellow-400",
        statusText: "Running",
      }
    : hasAnyFailure
      ? {
          icon: <X className="w-[10px] h-[10px]" />,
          colorClass: "text-red-600 dark:text-red-400",
          statusText: "Failed",
        }
      : allPassed
        ? {
            icon: <Check className="w-[10px] h-[10px]" />,
            colorClass: "text-green-600 dark:text-green-400",
            statusText: "Passed",
          }
        : {
            icon: <Circle className="w-[10px] h-[10px]" />,
            colorClass: "text-neutral-500 dark:text-neutral-400",
            statusText: "Checks",
          };

  return (
    <div className={`flex items-center gap-1 ml-2 shrink-0 ${colorClass}`}>
      {icon}
      <span className="text-[9px] font-medium select-none">{statusText}</span>
    </div>
  );
}

function getStatusIcon(status?: string | null, conclusion?: string | null) {
  if (conclusion === "success") {
    return <Check className="w-3 h-3 text-green-600 dark:text-green-400" strokeWidth={2} />;
  }
  if (conclusion === "failure") {
    return <X className="w-3 h-3 text-red-600 dark:text-red-400" strokeWidth={2} />;
  }
  if (conclusion === "cancelled") {
    return <Circle className="w-3 h-3 text-neutral-500 dark:text-neutral-400" strokeWidth={2} />;
  }
  if (status === "in_progress" || status === "queued") {
    return <Loader2 className="w-3 h-3 text-yellow-600 dark:text-yellow-500 animate-spin" strokeWidth={2} />;
  }
  return <AlertCircle className="w-3 h-3 text-neutral-500 dark:text-neutral-400" strokeWidth={2} />;
}

function formatTimeAgo(timestamp?: number | null) {
  if (!timestamp) return "";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getStatusDescription(run: CombinedRun) {
  const parts: string[] = [];

  if (run.conclusion === "success") {
    if (run.type === "workflow" && typeof run.runDuration === "number") {
      const mins = Math.floor(run.runDuration / 60);
      const secs = run.runDuration % 60;
      parts.push(`Successful in ${mins}m ${secs}s`);
    } else {
      parts.push("Successful");
    }
  } else if (run.conclusion === "failure") {
    parts.push("Failed");
  } else if (run.conclusion === "cancelled") {
    parts.push("Cancelled");
  } else if (run.conclusion === "skipped") {
    parts.push("Skipped");
  } else if (run.conclusion === "timed_out") {
    parts.push("Timed out");
  } else if (run.conclusion === "action_required") {
    parts.push("Action required");
  } else if (run.conclusion === "neutral") {
    parts.push("Neutral");
  } else if (run.status === "in_progress") {
    parts.push("In progress");
  } else if (run.status === "queued") {
    parts.push("Queued");
  } else if (run.status === "waiting") {
    parts.push("Waiting");
  } else if (run.status === "pending") {
    parts.push("Pending");
  }

  const timeAgo = formatTimeAgo(run.timestamp as number | undefined);
  if (timeAgo) {
    parts.push(timeAgo);
  }

  return parts.join(" — ");
}

export function WorkflowRunsSection({
  allRuns,
  isLoading,
  isExpanded,
  onToggle,
}: {
  allRuns: CombinedRun[];
  isLoading: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const sortedRuns = useMemo(() => allRuns.slice().sort((a, b) => {
    const getStatusPriority = (run: CombinedRun) => {
      if (run.conclusion === "failure" || run.conclusion === "timed_out" || run.conclusion === "action_required") return 0;
      if (run.status === "in_progress" || run.status === "queued" || run.status === "waiting" || run.status === "pending") return 1;
      if (run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped") return 2;
      if (run.conclusion === "cancelled") return 3;
      return 4;
    };

    const priorityA = getStatusPriority(a);
    const priorityB = getStatusPriority(b);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    const timestampB = (b.timestamp as number | undefined) ?? 0;
    const timestampA = (a.timestamp as number | undefined) ?? 0;
    return timestampB - timestampA;
  }), [allRuns]);

  const runningRuns = sortedRuns.filter(
    (run) => run.status === "in_progress" || run.status === "queued" || run.status === "waiting" || run.status === "pending",
  );
  const hasAnyRunning = runningRuns.length > 0;
  const failedRuns = sortedRuns.filter(
    (run) => run.conclusion === "failure" || run.conclusion === "timed_out" || run.conclusion === "action_required",
  );
  const hasAnyFailure = failedRuns.length > 0;
  const passedRuns = sortedRuns.filter(
    (run) => run.conclusion === "success" || run.conclusion === "neutral" || run.conclusion === "skipped",
  );
  const allPassed = sortedRuns.length > 0 && passedRuns.length === sortedRuns.length;

  if (isLoading) {
    return (
      <div className="w-full flex items-center pl-3 pr-2.5 py-1.5 border-y border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex items-center" style={{ width: "20px" }}>
          <div className="w-3.5 h-3.5 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
        </div>
        <div className="flex items-center" style={{ width: "20px" }}>
          <div className="w-3 h-3 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
        </div>
        <div className="h-3 w-24 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />
      </div>
    );
  }

  if (allRuns.length === 0) {
    return null;
  }

  const { summaryIcon, summaryText, summaryColorClass } = hasAnyRunning
    ? {
        summaryIcon: <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />,
        summaryText: (() => {
          const parts: string[] = [];
          if (passedRuns.length > 0) {
            parts.push(`${passedRuns.length} passed`);
          }
          if (failedRuns.length > 0) {
            parts.push(`${failedRuns.length} failed`);
          }
          parts.push(`${runningRuns.length} running`);
          return parts.join(", ");
        })(),
        summaryColorClass: "text-yellow-600 dark:text-yellow-500",
      }
    : hasAnyFailure
      ? {
          summaryIcon: <X className="w-3 h-3" strokeWidth={2} />,
          summaryText: `${failedRuns.length} ${failedRuns.length === 1 ? "check" : "checks"} failed`,
          summaryColorClass: "text-red-600 dark:text-red-500",
        }
      : allPassed
        ? {
            summaryIcon: <Check className="w-3 h-3" strokeWidth={2} />,
            summaryText: "All checks passed",
            summaryColorClass: "text-green-600 dark:text-green-500",
          }
        : {
            summaryIcon: <Circle className="w-3 h-3" strokeWidth={2} />,
            summaryText: `${sortedRuns.length} ${sortedRuns.length === 1 ? "check" : "checks"}`,
            summaryColorClass: "text-neutral-500 dark:text-neutral-400",
          };

  return (
    <div className="bg-white dark:bg-neutral-950">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-900"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        <span className="font-medium text-neutral-700 dark:text-neutral-300 select-none">
          Checks
        </span>
        <span className={clsx("ml-2 flex items-center gap-2", summaryColorClass)}>
          {summaryIcon}
          <span>{summaryText}</span>
        </span>
      </button>
      {isExpanded ? (
        <div className="border-t border-neutral-200 dark:border-neutral-800">
          {sortedRuns.map((run, index) => {
            const name =
              (run.workflowName as string | undefined) ||
              (run.name as string | undefined) ||
              (run.displayTitle as string | undefined) ||
              (run.checkSuiteName as string | undefined) ||
              (run.context as string | undefined) ||
              "Check";
            const description = getStatusDescription(run);
            const href = typeof run.url === "string" && run.url.length > 0 ? run.url : undefined;
            const key = `${run.type}-${run.id ?? index}-${name}`;
            const borderClass = index < sortedRuns.length - 1
              ? "border-b border-neutral-200 dark:border-neutral-800"
              : "";

            return (
              <a
                key={key}
                href={href}
                target={href ? "_blank" : undefined}
                rel={href ? "noopener noreferrer" : undefined}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 text-xs",
                  href
                    ? "hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
                    : "text-neutral-500",
                  borderClass,
                )}
              >
                <span className="w-3 h-3 flex items-center justify-center">
                  {getStatusIcon(run.status as string | undefined, run.conclusion as string | undefined)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-neutral-700 dark:text-neutral-200 block truncate">
                    {name}
                  </span>
                  {description ? (
                    <span className="text-neutral-500 dark:text-neutral-400 block truncate">
                      {description}
                    </span>
                  ) : null}
                </span>
                {href ? <ExternalLink className="w-3 h-3 text-neutral-400" /> : null}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
