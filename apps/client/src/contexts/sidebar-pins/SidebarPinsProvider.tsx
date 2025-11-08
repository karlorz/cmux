import { type Id } from "@cmux/convex/dataModel";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const PIN_STORAGE_VERSION = 1;
const PIN_STORAGE_KEY = "cmux.sidebarPins.v1";

type SidebarPin = SidebarTaskPin | SidebarRunPin;

export interface SidebarTaskPin {
  type: "task";
  taskId: Id<"tasks">;
  pinnedAt: number;
}

export interface SidebarRunPin {
  type: "run";
  taskId: Id<"tasks">;
  runId: Id<"taskRuns">;
  pinnedAt: number;
}

interface SidebarPinStorage {
  version: number;
  order: string[];
  items: Record<string, SidebarPin>;
}

function createEmptyStorage(): SidebarPinStorage {
  return {
    version: PIN_STORAGE_VERSION,
    order: [],
    items: {},
  };
}

interface SidebarPinsContextValue {
  pinnedTasks: SidebarTaskPin[];
  pinnedRuns: SidebarRunPin[];
  isTaskPinned: (taskId: Id<"tasks">) => boolean;
  isRunPinned: (runId: Id<"taskRuns">) => boolean;
  pinTask: (taskId: Id<"tasks">) => void;
  unpinTask: (taskId: Id<"tasks">) => void;
  pinRun: (taskId: Id<"tasks">, runId: Id<"taskRuns">) => void;
  unpinRun: (runId: Id<"taskRuns">) => void;
}

const SidebarPinsContext = createContext<SidebarPinsContextValue | null>(null);

export function SidebarPinsProvider({ children }: { children: ReactNode }) {
  const [storage, setStorage] = useState<SidebarPinStorage>(() =>
    readStorage()
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(storage));
    } catch {
      // Ignore quota or serialization failures silently.
    }
  }, [storage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PIN_STORAGE_KEY || event.newValue === null) {
        return;
      }
      try {
        const parsed = sanitizeStorage(JSON.parse(event.newValue));
        setStorage(parsed);
      } catch {
        // Ignore malformed updates from other tabs.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const pinsInOrder = useMemo(() => {
    return storage.order
      .map((key) => storage.items[key])
      .filter((pin): pin is SidebarPin => Boolean(pin));
  }, [storage.items, storage.order]);

  const pinnedTasks = useMemo(
    () =>
      pinsInOrder.filter(
        (pin): pin is SidebarTaskPin => pin.type === "task"
      ),
    [pinsInOrder]
  );

  const pinnedRuns = useMemo(
    () =>
      pinsInOrder.filter((pin): pin is SidebarRunPin => pin.type === "run"),
    [pinsInOrder]
  );

  const pinnedTaskIdSet = useMemo(() => {
    const next = new Set<Id<"tasks">>();
    for (const pin of pinnedTasks) {
      next.add(pin.taskId);
    }
    return next;
  }, [pinnedTasks]);

  const pinnedRunIdSet = useMemo(() => {
    const next = new Set<Id<"taskRuns">>();
    for (const pin of pinnedRuns) {
      next.add(pin.runId);
    }
    return next;
  }, [pinnedRuns]);

  const pinTask = useCallback((taskId: Id<"tasks">) => {
    setStorage((prev) =>
      addOrUpdatePin(prev, makeTaskKey(taskId), {
        type: "task",
        taskId,
        pinnedAt: Date.now(),
      })
    );
  }, []);

  const unpinTask = useCallback((taskId: Id<"tasks">) => {
    setStorage((prev) => removePin(prev, makeTaskKey(taskId)));
  }, []);

  const pinRun = useCallback(
    (taskId: Id<"tasks">, runId: Id<"taskRuns">) => {
      setStorage((prev) =>
        addOrUpdatePin(prev, makeRunKey(runId), {
          type: "run",
          taskId,
          runId,
          pinnedAt: Date.now(),
        })
      );
    },
    []
  );

  const unpinRun = useCallback((runId: Id<"taskRuns">) => {
    setStorage((prev) => removePin(prev, makeRunKey(runId)));
  }, []);

  const isTaskPinned = useCallback(
    (taskId: Id<"tasks">) => pinnedTaskIdSet.has(taskId),
    [pinnedTaskIdSet]
  );

  const isRunPinned = useCallback(
    (runId: Id<"taskRuns">) => pinnedRunIdSet.has(runId),
    [pinnedRunIdSet]
  );

  const contextValue = useMemo<SidebarPinsContextValue>(
    () => ({
      pinnedTasks,
      pinnedRuns,
      isTaskPinned,
      isRunPinned,
      pinTask,
      unpinTask,
      pinRun,
      unpinRun,
    }),
    [
      pinRun,
      pinTask,
      pinnedRuns,
      pinnedTasks,
      isRunPinned,
      isTaskPinned,
      unpinRun,
      unpinTask,
    ]
  );

  return (
    <SidebarPinsContext.Provider value={contextValue}>
      {children}
    </SidebarPinsContext.Provider>
  );
}

export function useSidebarPins(): SidebarPinsContextValue {
  const context = useContext(SidebarPinsContext);
  if (!context) {
    throw new Error("useSidebarPins must be used within SidebarPinsProvider");
  }
  return context;
}

function makeTaskKey(taskId: Id<"tasks">): string {
  return `task:${taskId}`;
}

function makeRunKey(runId: Id<"taskRuns">): string {
  return `run:${runId}`;
}

function addOrUpdatePin(
  storage: SidebarPinStorage,
  key: string,
  value: SidebarPin
): SidebarPinStorage {
  const filteredOrder = storage.order.filter((existing) => existing !== key);
  return {
    version: PIN_STORAGE_VERSION,
    order: [key, ...filteredOrder],
    items: { ...storage.items, [key]: value },
  };
}

function removePin(storage: SidebarPinStorage, key: string): SidebarPinStorage {
  if (!storage.items[key]) {
    return storage;
  }
  const nextItems = { ...storage.items };
  delete nextItems[key];
  return {
    version: PIN_STORAGE_VERSION,
    order: storage.order.filter((existing) => existing !== key),
    items: nextItems,
  };
}

function readStorage(): SidebarPinStorage {
  if (typeof window === "undefined") {
    return createEmptyStorage();
  }
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) {
      return createEmptyStorage();
    }
    return sanitizeStorage(JSON.parse(raw));
  } catch {
    return createEmptyStorage();
  }
}

function sanitizeStorage(input: unknown): SidebarPinStorage {
  if (!input || typeof input !== "object") {
    return createEmptyStorage();
  }
  const parsed = input as Partial<SidebarPinStorage>;
  if (parsed.version !== PIN_STORAGE_VERSION) {
    return createEmptyStorage();
  }
  const sanitizedItems: Record<string, SidebarPin> = {};
  const rawItems =
    parsed.items && typeof parsed.items === "object" ? parsed.items : {};
  for (const [key, value] of Object.entries(rawItems)) {
    if (!value || typeof value !== "object") continue;
    if (value.type === "task" && typeof value.taskId === "string") {
      const pinnedAt =
        typeof value.pinnedAt === "number" ? value.pinnedAt : Date.now();
      sanitizedItems[key] = {
        type: "task",
        taskId: value.taskId as Id<"tasks">,
        pinnedAt,
      };
    } else if (
      value.type === "run" &&
      typeof value.taskId === "string" &&
      typeof value.runId === "string"
    ) {
      const pinnedAt =
        typeof value.pinnedAt === "number" ? value.pinnedAt : Date.now();
      sanitizedItems[key] = {
        type: "run",
        taskId: value.taskId as Id<"tasks">,
        runId: value.runId as Id<"taskRuns">,
        pinnedAt,
      };
    }
  }
  const order = Array.isArray(parsed.order) ? parsed.order : [];
  const sanitizedOrder = order.filter((key) => key in sanitizedItems);
  return {
    version: PIN_STORAGE_VERSION,
    order: sanitizedOrder,
    items: sanitizedItems,
  };
}
