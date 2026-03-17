import { useMemo, useState } from "react";
import {
  Radio,
  CheckCircle,
  Clock,
  AlertTriangle,
  Wifi,
  WifiOff,
  X,
  Filter,
} from "lucide-react";
import clsx from "clsx";
import {
  useOrchestrationEvents,
  type OrchestrationEvent,
} from "@/hooks/useOrchestrationEvents";

interface OrchestrationEventStreamProps {
  orchestrationId: string;
  teamSlugOrId: string;
  onClose?: () => void;
}

type EventFilter = "all" | "status" | "completion" | "errors";

const eventIcons: Record<string, typeof CheckCircle> = {
  connected: Wifi,
  task_status: Clock,
  task_completed: CheckCircle,
  orchestration_completed: CheckCircle,
  error: AlertTriangle,
};

const statusColors: Record<string, string> = {
  completed: "text-green-500",
  failed: "text-red-500",
  cancelled: "text-neutral-500",
  running: "text-blue-500",
  pending: "text-amber-500",
  assigned: "text-amber-500",
};

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const EVENT_FILTERS: { key: EventFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "status", label: "Status" },
  { key: "completion", label: "Completions" },
  { key: "errors", label: "Errors" },
];

export function OrchestrationEventStream({
  orchestrationId,
  teamSlugOrId,
  onClose,
}: OrchestrationEventStreamProps) {
  const [expanded, setExpanded] = useState(false);
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");

  const { connected, events, error } = useOrchestrationEvents({
    orchestrationId,
    teamSlugOrId,
    enabled: true,
  });

  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") return events;
    return events.filter((e) => {
      switch (eventFilter) {
        case "status":
          return e.event === "task_status" || e.event === "heartbeat";
        case "completion":
          return e.event === "task_completed" || e.event === "orchestration_completed";
        case "errors":
          return e.event === "error" || e.status === "failed" || e.errorMessage;
        default:
          return true;
      }
    });
  }, [events, eventFilter]);

  return (
    <div
      className={clsx(
        "rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
        expanded ? "max-h-96" : "max-h-48"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Radio
            className={clsx(
              "size-4",
              connected ? "text-green-500 animate-pulse" : "text-neutral-400"
            )}
          />
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            Event Stream
          </span>
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs",
              connected
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            )}
          >
            {connected ? (
              <>
                <Wifi className="size-3" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="size-3" />
                Disconnected
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Event type filter */}
          <div className="flex items-center gap-1">
            <Filter className="size-3 text-neutral-400" />
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as EventFilter)}
              className="rounded border-0 bg-transparent py-0.5 text-xs text-neutral-600 focus:ring-0 dark:text-neutral-400"
            >
              {EVENT_FILTERS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          <AlertTriangle className="size-3" />
          {error}
        </div>
      )}

      {/* Events list */}
      <div className="overflow-auto" style={{ maxHeight: expanded ? "calc(24rem - 3rem)" : "calc(12rem - 3rem)" }}>
        {filteredEvents.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-xs text-neutral-400">
            {events.length === 0
              ? (connected ? "Waiting for events..." : "Connect to see events")
              : `No ${eventFilter} events`}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filteredEvents.map((event, idx) => (
              <EventRow key={`${event.timestamp}-${idx}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: OrchestrationEvent }) {
  const Icon = eventIcons[event.event] ?? Clock;
  const statusColor = event.status ? statusColors[event.status] ?? "text-neutral-500" : "text-neutral-500";

  return (
    <div className="px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Icon className={clsx("size-3.5", statusColor)} />
        <span className="font-mono text-neutral-400">
          {formatTime(event.timestamp)}
        </span>
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          {event.event.replace(/_/g, " ")}
        </span>
        {event.status && (
          <span className={clsx("font-medium", statusColor)}>
            {event.status}
          </span>
        )}
      </div>
      {event.prompt && (
        <div className="mt-1 pl-5 text-neutral-500 dark:text-neutral-400 line-clamp-1">
          {event.prompt}
        </div>
      )}
      {event.agentName && (
        <span className="ml-5 text-neutral-400">
          {event.agentName}
        </span>
      )}
      {event.result && (
        <div className="mt-1 pl-5 rounded bg-green-50 px-2 py-1 text-green-700 dark:bg-green-900/20 dark:text-green-400 line-clamp-2">
          {event.result}
        </div>
      )}
      {event.errorMessage && (
        <div className="mt-1 pl-5 rounded bg-red-50 px-2 py-1 text-red-700 dark:bg-red-900/20 dark:text-red-400 line-clamp-2">
          {event.errorMessage}
        </div>
      )}
      {event.aggregatedStatus && (
        <div className="mt-1 pl-5 flex gap-3 text-neutral-500">
          <span>Total: {event.aggregatedStatus.total}</span>
          <span className="text-green-500">Done: {event.aggregatedStatus.completed}</span>
          <span className="text-blue-500">Running: {event.aggregatedStatus.running}</span>
          <span className="text-red-500">Failed: {event.aggregatedStatus.failed}</span>
        </div>
      )}
    </div>
  );
}
