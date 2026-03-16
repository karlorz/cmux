import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { authJsonQueryOptions } from "@/contexts/convex/authJsonQueryOptions";

export interface OrchestrationEvent {
  event: string;
  taskId?: string;
  status?: string;
  previousStatus?: string;
  prompt?: string;
  agentName?: string;
  result?: string;
  errorMessage?: string;
  aggregatedStatus?: {
    total: number;
    completed: number;
    running: number;
    failed: number;
    pending: number;
  };
  timestamp: string;
}

interface UseOrchestrationEventsOptions {
  orchestrationId: string;
  teamSlugOrId: string;
  enabled?: boolean;
  onEvent?: (event: OrchestrationEvent) => void;
  onTaskCompleted?: (taskId: string, status: string, result?: string) => void;
  onOrchestrationCompleted?: (aggregatedStatus: OrchestrationEvent["aggregatedStatus"]) => void;
}

export function useOrchestrationEvents({
  orchestrationId,
  teamSlugOrId,
  enabled = true,
  onEvent,
  onTaskCompleted,
  onOrchestrationCompleted,
}: UseOrchestrationEventsOptions) {
  const authJsonQuery = useQuery(authJsonQueryOptions());
  const accessToken = authJsonQuery.data?.accessToken;
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<OrchestrationEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !orchestrationId || !teamSlugOrId) {
      disconnect();
      return;
    }

    if (!accessToken) {
      setError("Not authenticated");
      return;
    }

    // Build SSE URL - auth is handled via cookies (withCredentials: true)
    const baseUrl = import.meta.env.VITE_API_URL || "";
    const params = new URLSearchParams({ teamSlugOrId });
    const url = `${baseUrl}/api/orchestrate/events/${orchestrationId}?${params}`;

    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", (e) => {
      setConnected(true);
      setError(null);
      const data = JSON.parse(e.data) as OrchestrationEvent;
      setEvents((prev) => [...prev, { ...data, event: "connected" }]);
      onEvent?.({ ...data, event: "connected" });
    });

    eventSource.addEventListener("task_status", (e) => {
      const data = JSON.parse(e.data) as OrchestrationEvent;
      setEvents((prev) => [...prev, { ...data, event: "task_status" }]);
      onEvent?.({ ...data, event: "task_status" });
    });

    eventSource.addEventListener("task_completed", (e) => {
      const data = JSON.parse(e.data) as OrchestrationEvent;
      setEvents((prev) => [...prev, { ...data, event: "task_completed" }]);
      onEvent?.({ ...data, event: "task_completed" });
      if (data.taskId && data.status) {
        onTaskCompleted?.(data.taskId, data.status, data.result ?? undefined);
      }
    });

    eventSource.addEventListener("orchestration_completed", (e) => {
      const data = JSON.parse(e.data) as OrchestrationEvent;
      setEvents((prev) => [...prev, { ...data, event: "orchestration_completed" }]);
      onEvent?.({ ...data, event: "orchestration_completed" });
      onOrchestrationCompleted?.(data.aggregatedStatus);
      // Auto-disconnect when orchestration is complete
      disconnect();
    });

    eventSource.addEventListener("heartbeat", (e) => {
      const data = JSON.parse(e.data) as OrchestrationEvent;
      onEvent?.({ ...data, event: "heartbeat" });
    });

    eventSource.addEventListener("error", (e) => {
      if (e instanceof MessageEvent) {
        const data = JSON.parse(e.data) as { message: string };
        setError(data.message);
      }
    });

    eventSource.onerror = () => {
      setConnected(false);
      setError("Connection lost");
    };

    return () => {
      disconnect();
    };
  }, [
    enabled,
    orchestrationId,
    teamSlugOrId,
    accessToken,
    onEvent,
    onTaskCompleted,
    onOrchestrationCompleted,
    disconnect,
  ]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    connected,
    events,
    error,
    clearEvents,
    disconnect,
  };
}
