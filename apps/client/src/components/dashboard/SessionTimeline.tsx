import { api } from "@cmux/convex/api";
import { useQuery as useConvexQuery } from "convex/react";
import {
  GitCommit,
  GitPullRequest,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  FileCode,
  Plus,
  Minus,
} from "lucide-react";
import { memo, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatTime, formatShortDate, formatDuration } from "@/lib/time";
import { SessionTimelineSkeleton } from "./DashboardSkeletons";

interface SessionTimelineProps {
  teamSlugOrId: string;
  limit?: number;
  className?: string;
}

interface TimelineEvent {
  id: string;
  type: "start" | "commit" | "pr" | "end";
  timestamp: string;
  title: string;
  subtitle?: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
  url?: string;
  sha?: string;
  prNumber?: number;
}

function TimelineEventItem({
  event,
  isLast,
  isExpanded,
  onToggle,
}: {
  event: TimelineEvent;
  isLast: boolean;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const iconMap = {
    start: Play,
    commit: GitCommit,
    pr: GitPullRequest,
    end: Square,
  };
  const Icon = iconMap[event.type];

  const colorMap = {
    start: "text-blue-500 bg-blue-50 dark:bg-blue-950",
    commit: "text-purple-500 bg-purple-50 dark:bg-purple-950",
    pr: "text-green-500 bg-green-50 dark:bg-green-950",
    end: "text-neutral-500 bg-neutral-50 dark:bg-neutral-800",
  };

  const hasDetails = event.type === "commit" || event.type === "pr";

  return (
    <div className="relative flex gap-3">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-0.5 bg-neutral-200 dark:bg-neutral-700" />
      )}

      {/* Icon */}
      <div
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
          colorMap[event.type]
        )}
      >
        <Icon className="size-4" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            {hasDetails && onToggle ? (
              <button
                onClick={onToggle}
                className="flex items-center gap-1 text-left hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 text-neutral-400" />
                ) : (
                  <ChevronRight className="size-4 text-neutral-400" />
                )}
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {event.title}
                </span>
              </button>
            ) : (
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {event.title}
              </span>
            )}
            {event.subtitle && (
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {event.subtitle}
              </p>
            )}
          </div>
          <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
            {formatTime(event.timestamp)}
          </span>
        </div>

        {/* Expanded details */}
        {isExpanded && hasDetails && (
          <div className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
            <div className="flex flex-wrap gap-4 text-xs">
              {event.filesChanged !== undefined && (
                <div className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400">
                  <FileCode className="size-3" />
                  <span>{event.filesChanged} files</span>
                </div>
              )}
              {event.additions !== undefined && (
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Plus className="size-3" />
                  <span>{event.additions}</span>
                </div>
              )}
              {event.deletions !== undefined && (
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <Minus className="size-3" />
                  <span>{event.deletions}</span>
                </div>
              )}
            </div>
            {event.sha && (
              <div className="mt-2 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                {event.sha.slice(0, 7)}
              </div>
            )}
            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                View on GitHub
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionTimelineContent({ teamSlugOrId, limit = 5 }: SessionTimelineProps) {
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const result = useConvexQuery(api.sessionActivity.listByTeam, {
    teamSlugOrId,
    limit,
  });

  const sessions = useMemo(() => result?.items ?? [], [result?.items]);

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const toggleSession = (sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  // Convert session data to timeline events
  const sessionEvents = useMemo(() => {
    return sessions.map((session) => {
      const events: TimelineEvent[] = [];

      // Session start
      events.push({
        id: `${session._id}-start`,
        type: "start",
        timestamp: session.startedAt,
        title: "Session started",
        subtitle: `Starting commit: ${session.startCommit.slice(0, 7)}`,
      });

      // Commits (sorted by timestamp)
      const sortedCommits = [...session.commits].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      for (const commit of sortedCommits) {
        events.push({
          id: `${session._id}-commit-${commit.sha}`,
          type: "commit",
          timestamp: commit.timestamp,
          title: commit.message.split("\n")[0].slice(0, 60) + (commit.message.length > 60 ? "..." : ""),
          subtitle: `${commit.filesChanged} files changed`,
          sha: commit.sha,
          additions: commit.additions,
          deletions: commit.deletions,
          filesChanged: commit.filesChanged,
        });
      }

      // PRs (sorted by mergedAt)
      const sortedPRs = [...session.prsMerged].sort(
        (a, b) => new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime()
      );
      for (const pr of sortedPRs) {
        events.push({
          id: `${session._id}-pr-${pr.number}`,
          type: "pr",
          timestamp: pr.mergedAt,
          title: `PR #${pr.number} merged`,
          subtitle: pr.title,
          url: pr.url,
          prNumber: pr.number,
          additions: pr.additions,
          deletions: pr.deletions,
          filesChanged: pr.filesChanged,
        });
      }

      // Session end (if ended)
      if (session.endedAt) {
        events.push({
          id: `${session._id}-end`,
          type: "end",
          timestamp: session.endedAt,
          title: "Session ended",
          subtitle: session.durationMs ? `Duration: ${formatDuration(session.durationMs)}` : undefined,
        });
      }

      // Sort all events by timestamp
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      return {
        session,
        events,
      };
    });
  }, [sessions]);

  if (!result) {
    return <SessionTimelineSkeleton className="border-0 p-0" />;
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <GitCommit className="size-8 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No session activity yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessionEvents.map(({ session, events }) => {
        const isExpanded = expandedSessions.has(session._id);
        const dateStr = formatShortDate(session.startedAt);
        const timeStr = formatTime(session.startedAt);

        return (
          <div
            key={session._id}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700"
          >
            {/* Session header */}
            <button
              onClick={() => toggleSession(session._id)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="size-4 text-neutral-400" />
                ) : (
                  <ChevronRight className="size-4 text-neutral-400" />
                )}
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {dateStr} at {timeStr}
                </span>
                {session.durationMs && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    ({formatDuration(session.durationMs)})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="flex items-center gap-1">
                  <GitCommit className="size-3" />
                  {session.stats.totalCommits}
                </span>
                <span className="flex items-center gap-1">
                  <GitPullRequest className="size-3" />
                  {session.stats.totalPRs}
                </span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Plus className="size-3" />
                  {session.stats.totalAdditions}
                </span>
                <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                  <Minus className="size-3" />
                  {session.stats.totalDeletions}
                </span>
              </div>
            </button>

            {/* Timeline content */}
            {isExpanded && (
              <div className="border-t border-neutral-200 p-4 dark:border-neutral-700">
                {events.map((event, index) => (
                  <TimelineEventItem
                    key={event.id}
                    event={event}
                    isLast={index === events.length - 1}
                    isExpanded={expandedEvents.has(event.id)}
                    onToggle={
                      event.type === "commit" || event.type === "pr"
                        ? () => toggleEvent(event.id)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const SessionTimeline = memo(function SessionTimeline({
  teamSlugOrId,
  limit = 5,
  className,
}: SessionTimelineProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Session Timeline
        </h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Visual timeline of commits and PRs per session
        </p>
      </div>
      <SessionTimelineContent teamSlugOrId={teamSlugOrId} limit={limit} />
    </div>
  );
});
