import { useCallback, useEffect, useMemo, useState } from "react";

import type { Id } from "@cmux/convex/dataModel";

const STORAGE_VERSION = 1;

interface TaskPinRecord {
  taskPinnedAt?: number;
  runPins?: Record<string, number>;
}

interface SerializedPins {
  version: number;
  tasks: Record<string, TaskPinRecord>;
}

const EMPTY_STATE: SerializedPins = { version: STORAGE_VERSION, tasks: {} };

interface PinnedTaskEntry {
  taskId: Id<"tasks">;
  pinnedAt: number;
}

interface PinnedRunEntry {
  taskId: Id<"tasks">;
  runId: Id<"taskRuns">;
  pinnedAt: number;
}

export interface SidebarPinControls {
  isTaskPinned: (taskId: Id<"tasks">) => boolean;
  setTaskPinned: (taskId: Id<"tasks">, pinned: boolean) => void;
  isRunPinned: (taskId: Id<"tasks">, runId: Id<"taskRuns">) => boolean;
  setRunPinned: (
    taskId: Id<"tasks">,
    runId: Id<"taskRuns">,
    pinned: boolean
  ) => void;
}

export interface UseSidebarPinsResult extends SidebarPinControls {
  pinnedTasks: PinnedTaskEntry[];
  pinnedRuns: PinnedRunEntry[];
}

function readPinsFromStorage(storageKey: string): SerializedPins {
  if (typeof window === "undefined") {
    return EMPTY_STATE;
  }
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return EMPTY_STATE;
  }
  try {
    const parsed = JSON.parse(raw) as SerializedPins;
    if (parsed.version !== STORAGE_VERSION || !parsed.tasks) {
      return EMPTY_STATE;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to parse sidebar pins", error);
    return EMPTY_STATE;
  }
}

function persistPins(storageKey: string, value: SerializedPins) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

function cleanTaskRecord(record: TaskPinRecord): TaskPinRecord | null {
  const hasRuns = record.runPins && Object.keys(record.runPins).length > 0;
  if (record.taskPinnedAt || hasRuns) {
    return {
      ...(record.taskPinnedAt ? { taskPinnedAt: record.taskPinnedAt } : {}),
      ...(hasRuns ? { runPins: record.runPins } : {}),
    };
  }
  return null;
}

export function useSidebarPins(teamSlugOrId: string): UseSidebarPinsResult {
  const storageKey = useMemo(
    () => `cmux:sidebarPins:${teamSlugOrId}`,
    [teamSlugOrId]
  );

  const [state, setState] = useState<SerializedPins>(() =>
    readPinsFromStorage(storageKey)
  );

  useEffect(() => {
    setState(readPinsFromStorage(storageKey));
  }, [storageKey]);

  const updateState = useCallback(
    (mutator: (prev: SerializedPins) => SerializedPins) => {
      setState((prev) => {
        const next = mutator(prev);
        persistPins(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const setTaskPinned = useCallback(
    (taskId: Id<"tasks">, pinned: boolean) => {
      updateState((prev) => {
        const current = prev.tasks[taskId] ?? {};
        const nextTasks = { ...prev.tasks };
        let changed = false;
        if (pinned) {
          if (current.taskPinnedAt) {
            return prev;
          }
          nextTasks[taskId] = {
            ...current,
            taskPinnedAt: Date.now(),
          };
          changed = true;
        } else {
          if (!current.taskPinnedAt) {
            return prev;
          }
          const cleaned = cleanTaskRecord({
            ...current,
            taskPinnedAt: undefined,
          });
          if (cleaned) {
            nextTasks[taskId] = cleaned;
          } else {
            delete nextTasks[taskId];
          }
          changed = true;
        }
        if (!changed) {
          return prev;
        }
        return { ...prev, tasks: nextTasks };
      });
    },
    [updateState]
  );

  const setRunPinned = useCallback(
    (taskId: Id<"tasks">, runId: Id<"taskRuns">, pinned: boolean) => {
      updateState((prev) => {
        const current = prev.tasks[taskId] ?? {};
        const nextTasks = { ...prev.tasks };
        const nextRuns = { ...(current.runPins ?? {}) };
        if (pinned) {
          if (nextRuns[runId]) {
            return prev;
          }
          nextRuns[runId] = Date.now();
        } else {
          if (!nextRuns[runId]) {
            return prev;
          }
          delete nextRuns[runId];
        }
        const cleaned = cleanTaskRecord({
          ...current,
          runPins: Object.keys(nextRuns).length > 0 ? nextRuns : undefined,
        });
        if (cleaned) {
          nextTasks[taskId] = cleaned;
        } else {
          delete nextTasks[taskId];
        }
        return { ...prev, tasks: nextTasks };
      });
    },
    [updateState]
  );

  const pinnedTasks = useMemo<PinnedTaskEntry[]>(() => {
    return Object.entries(state.tasks)
      .filter(([, record]) => typeof record.taskPinnedAt === "number")
      .map(([taskId, record]) => ({
        taskId: taskId as Id<"tasks">,
        pinnedAt: record.taskPinnedAt ?? 0,
      }))
      .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  }, [state.tasks]);

  const pinnedRuns = useMemo<PinnedRunEntry[]>(() => {
    const entries: PinnedRunEntry[] = [];
    for (const [taskId, record] of Object.entries(state.tasks)) {
      if (!record.runPins) continue;
      for (const [runId, pinnedAt] of Object.entries(record.runPins)) {
        entries.push({
          taskId: taskId as Id<"tasks">,
          runId: runId as Id<"taskRuns">,
          pinnedAt,
        });
      }
    }
    return entries.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  }, [state.tasks]);

  const pinnedTaskIds = useMemo(() => {
    return new Set(pinnedTasks.map((entry) => entry.taskId));
  }, [pinnedTasks]);

  const pinnedRunLookup = useMemo(() => {
    const map = new Map<Id<"tasks">, Set<Id<"taskRuns">>>();
    for (const entry of pinnedRuns) {
      const existing = map.get(entry.taskId) ?? new Set<Id<"taskRuns">>();
      existing.add(entry.runId);
      map.set(entry.taskId, existing);
    }
    return map;
  }, [pinnedRuns]);

  const isTaskPinned = useCallback(
    (taskId: Id<"tasks">) => pinnedTaskIds.has(taskId),
    [pinnedTaskIds]
  );

  const isRunPinned = useCallback(
    (taskId: Id<"tasks">, runId: Id<"taskRuns">) =>
      pinnedRunLookup.get(taskId)?.has(runId) ?? false,
    [pinnedRunLookup]
  );

  return {
    pinnedTasks,
    pinnedRuns,
    isTaskPinned,
    setTaskPinned,
    isRunPinned,
    setRunPinned,
  };
}
