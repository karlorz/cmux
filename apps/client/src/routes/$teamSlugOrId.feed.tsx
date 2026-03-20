import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { convexAuthReadyPromise } from "@/contexts/convex/convex-auth-ready";
import { ConvexClientProvider } from "@/contexts/convex/convex-client-provider";
import { convexQueryClient } from "@/contexts/convex/convex-query-client";
import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";
import { api } from "@cmux/convex/api";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  CheckCircle2,
  XCircle,
  GitPullRequest,
  GitMerge,
  GitPullRequestClosed,
  Play,
  AlertTriangle,
  Shield,
  ShieldCheck,
  Flag,
  FolderPlus,
  Users,
  Filter,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  Search,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/$teamSlugOrId/feed")({
  component: FeedPageWrapper,
  beforeLoad: async ({ params, location }) => {
    const user = await cachedGetUser(stackClientApp);
    if (!user) {
      throw redirect({
        to: "/sign-in",
        search: {
          after_auth_return_to: location.pathname,
        },
      });
    }

    await convexAuthReadyPromise;

    const { teamSlugOrId } = params;
    const teamMemberships = await convexQueryClient.convexClient.query(
      api.teams.listTeamMemberships
    );
    const teamMembership = teamMemberships.find((membership) => {
      const team = membership.team;
      const membershipTeamId = team?.teamId ?? membership.teamId;
      const membershipSlug = team?.slug;
      return (
        membershipSlug === teamSlugOrId || membershipTeamId === teamSlugOrId
      );
    });
    if (!teamMembership) {
      throw redirect({ to: "/team-picker" });
    }
  },
});

function FeedPageWrapper() {
  return (
    <ConvexClientProvider>
      <FeedPage />
    </ConvexClientProvider>
  );
}

// Event type configuration
const EVENT_CONFIG = {
  task_completed: {
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Task Completed",
  },
  task_failed: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    label: "Task Failed",
  },
  pr_merged: {
    icon: GitMerge,
    color: "text-purple-500",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    label: "PR Merged",
  },
  pr_opened: {
    icon: GitPullRequest,
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "PR Opened",
  },
  pr_closed: {
    icon: GitPullRequestClosed,
    color: "text-neutral-500",
    bgColor: "bg-neutral-100 dark:bg-neutral-800",
    label: "PR Closed",
  },
  agent_started: {
    icon: Play,
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "Agent Started",
  },
  agent_error: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    label: "Agent Error",
  },
  approval_required: {
    icon: Shield,
    color: "text-amber-500",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    label: "Approval Required",
  },
  approval_resolved: {
    icon: ShieldCheck,
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Approval Resolved",
  },
  milestone_completed: {
    icon: Flag,
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Milestone Completed",
  },
  project_created: {
    icon: FolderPlus,
    color: "text-blue-500",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "Project Created",
  },
  orchestration_completed: {
    icon: Users,
    color: "text-green-500",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    label: "Orchestration Completed",
  },
} as const;

type EventType = keyof typeof EVENT_CONFIG;

interface FeedEvent {
  _id: string;
  teamId: string;
  userId?: string;
  eventType: EventType;
  title: string;
  description?: string;
  taskId?: string;
  taskRunId?: string;
  projectId?: string;
  orchestrationTaskId?: string;
  agentName?: string;
  repoFullName?: string;
  prNumber?: number;
  prUrl?: string;
  errorMessage?: string;
  createdAt: number;
}

function FeedEventItem({ event, teamSlugOrId }: { event: FeedEvent; teamSlugOrId: string }) {
  const config = EVENT_CONFIG[event.eventType];
  const Icon = config.icon;

  return (
    <div className="flex gap-4 py-4 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      {/* Icon */}
      <div className={clsx("flex-shrink-0 rounded-full p-2", config.bgColor)}>
        <Icon className={clsx("size-5", config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">
              {event.title}
            </p>
            {event.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5 line-clamp-2">
                {event.description}
              </p>
            )}
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
          </span>
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className={clsx("font-medium", config.color)}>
            {config.label}
          </span>

          {event.agentName && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">|</span>
              <span className="font-mono">{event.agentName}</span>
            </>
          )}

          {event.repoFullName && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">|</span>
              <span className="font-mono">{event.repoFullName}</span>
            </>
          )}

          {event.prUrl && (
            <>
              <span className="text-neutral-300 dark:text-neutral-600">|</span>
              <a
                href={event.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
              >
                PR #{event.prNumber}
                <ExternalLink className="size-3" />
              </a>
            </>
          )}
        </div>

        {/* Error message */}
        {event.errorMessage && (
          <div className="mt-2 rounded bg-red-50 dark:bg-red-900/20 px-3 py-2">
            <p className="text-xs text-red-600 dark:text-red-400 font-mono">
              {event.errorMessage}
            </p>
          </div>
        )}

        {/* Links */}
        {(event.taskId || event.taskRunId) && (
          <div className="mt-2">
            <Link
              to="/$teamSlugOrId"
              params={{ teamSlugOrId }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              View task details
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; count?: number }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={clsx(
          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
          value !== "all"
            ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            : "border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        )}
      >
        <Filter className="size-4" />
        {label}: {options.find((o) => o.value === value)?.label ?? "All"}
        <ChevronDown className="size-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[200px] rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full items-center justify-between px-3 py-2 text-sm transition-colors",
                  value === option.value
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                    : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                )}
              >
                <span>{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs text-neutral-400">{option.count}</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FeedPage() {
  const { teamSlugOrId } = Route.useParams();

  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Get team memberships to resolve teamId
  const teamMemberships = useQuery(api.teams.listTeamMemberships);
  const teamId = useMemo(() => {
    if (!teamMemberships) return undefined;
    const membership = teamMemberships.find((m) => {
      const team = m.team;
      const id = team?.teamId ?? m.teamId;
      const slug = team?.slug;
      return slug === teamSlugOrId || id === teamSlugOrId;
    });
    return membership?.teamId;
  }, [teamMemberships, teamSlugOrId]);

  // Query feed events
  const feedResult = useQuery(
    api.feedEvents.list,
    teamId
      ? {
          teamId,
          eventType: eventTypeFilter !== "all" ? (eventTypeFilter as EventType) : undefined,
          limit: 100,
        }
      : "skip"
  );

  // Query event counts for filter badges
  const eventCounts = useQuery(
    api.feedEvents.countsByType,
    teamId
      ? {
          teamId,
          since: Date.now() - 7 * 24 * 60 * 60 * 1000, // Last 7 days
        }
      : "skip"
  );

  // Build filter options
  const eventTypeOptions = useMemo(() => {
    const allCount = eventCounts
      ? Object.values(eventCounts).reduce((a, b) => a + b, 0)
      : 0;

    const options = [
      { value: "all", label: "All Events", count: allCount },
      ...Object.entries(EVENT_CONFIG).map(([key, config]) => ({
        value: key,
        label: config.label,
        count: eventCounts?.[key] ?? 0,
      })),
    ];

    return options;
  }, [eventCounts]);

  // Filter events by search query
  const filteredEvents = useMemo(() => {
    if (!feedResult?.items) return [];
    if (!searchQuery.trim()) return feedResult.items;

    const query = searchQuery.toLowerCase();
    return feedResult.items.filter(
      (event) =>
        event.title.toLowerCase().includes(query) ||
        event.description?.toLowerCase().includes(query) ||
        event.agentName?.toLowerCase().includes(query) ||
        event.repoFullName?.toLowerCase().includes(query)
    );
  }, [feedResult?.items, searchQuery]);

  const isLoading = teamMemberships === undefined || (teamId && feedResult === undefined);

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity className="size-6 text-neutral-500" />
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
              Team Feed
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Trigger refetch by invalidating query (handled by Convex reactivity)
            }}
          >
            <RefreshCw className="size-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>

          {/* Event type filter */}
          <FilterDropdown
            label="Event type"
            value={eventTypeFilter}
            options={eventTypeOptions}
            onChange={setEventTypeFilter}
          />
        </div>

        {/* Feed content */}
        <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Activity className="size-8 text-neutral-400 dark:text-neutral-500 mb-2" />
              <p className="text-neutral-600 dark:text-neutral-400">
                {searchQuery ? "No events match your search" : "No recent activity"}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Activity from your team will appear here"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 px-4">
              {filteredEvents.map((event) => (
                <FeedEventItem
                  key={event._id}
                  event={event as FeedEvent}
                  teamSlugOrId={teamSlugOrId}
                />
              ))}
            </div>
          )}

          {/* Load more */}
          {feedResult?.hasMore && (
            <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-3 text-center">
              <button
                type="button"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Load more events
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
