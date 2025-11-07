import { isElectron } from "@/lib/electron";
import type { ParsedLocation } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  NavigationHistoryContext,
  type NavigationHistoryContextValue,
  type NavigationHistoryEntry,
} from "./context";

const MAX_HISTORY_ENTRIES = 50;

type NavigationHistoryState = {
  entries: NavigationHistoryEntry[];
  currentIndex: number;
};

export function NavigationHistoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const location = useRouterState({
    select: (state) => state.location,
  });

  const [state, setState] = useState<NavigationHistoryState>(() => ({
    entries: [createHistoryEntry(location)],
    currentIndex: 0,
  }));
  const historyStateRef = useRef(state);

  const setHistoryState = useCallback(
    (updater: (prev: NavigationHistoryState) => NavigationHistoryState) => {
      setState((prev) => {
        const next = updater(prev);
        historyStateRef.current = next;
        return next;
      });
    },
    []
  );

  const [historyMenuRequestId, setHistoryMenuRequestId] = useState(0);

  // Track router location changes to build a navigation history stack
  useEffect(() => {
    const nextHref = location.href;
    setHistoryState((prev) => {
      const existingIndex = prev.entries.findIndex(
        (entry) => entry.href === nextHref
      );

      if (existingIndex >= 0) {
        if (existingIndex === prev.currentIndex) {
          return prev;
        }
        return {
          ...prev,
          currentIndex: existingIndex,
        };
      }

      const nextEntry = createHistoryEntry(location);
      let entries = prev.entries.slice(0, prev.currentIndex + 1);
      entries = [...entries, nextEntry];

      if (entries.length > MAX_HISTORY_ENTRIES) {
        const overflow = entries.length - MAX_HISTORY_ENTRIES;
        entries = entries.slice(overflow);
      }

      return {
        entries,
        currentIndex: entries.length - 1,
      };
    });
  }, [location, setHistoryState]);

  const goDelta = useCallback((delta: number) => {
    if (delta === 0) return;
    if (typeof window === "undefined") return;
    try {
      window.history.go(delta);
    } catch (error) {
      console.warn("[NavigationHistory] Failed to move in history", error);
    }
  }, []);

  const goBack = useCallback(() => {
    if (historyStateRef.current.currentIndex === 0) return;
    goDelta(-1);
  }, [goDelta]);

  const goForward = useCallback(() => {
    const { currentIndex, entries } = historyStateRef.current;
    if (currentIndex >= entries.length - 1) return;
    goDelta(1);
  }, [goDelta]);

  const goToIndex = useCallback(
    (index: number) => {
      const { currentIndex, entries } = historyStateRef.current;
      if (index < 0 || index >= entries.length) return;
      const delta = index - currentIndex;
      if (delta === 0) return;
      goDelta(delta);
    },
    [goDelta]
  );

  const requestHistoryMenuToggle = useCallback(() => {
    setHistoryMenuRequestId((prev) => prev + 1);
  }, []);

  // Keyboard shortcuts for web builds
  useEffect(() => {
    if (isElectron) return;
    const handler = (event: KeyboardEvent) => {
      if (!isHistoryModifier(event)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "[" || event.code === "BracketLeft") {
        event.preventDefault();
        goBack();
        return;
      }
      if (key === "]" || event.code === "BracketRight") {
        event.preventDefault();
        goForward();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        requestHistoryMenuToggle();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [goBack, goForward, requestHistoryMenuToggle]);

  // Electron shortcut bridge
  useEffect(() => {
    if (!isElectron) return;
    const maybeWindow = window as typeof window & {
      cmux?: {
        on?: (
          event: string,
          callback: (...args: unknown[]) => void
        ) => (() => void) | void;
      };
    };
    const disposers: Array<(() => void) | void> = [];
    const cmux = maybeWindow.cmux;
    if (cmux?.on) {
      disposers.push(
        cmux.on("shortcut:history-back", () => goBack()) ?? undefined
      );
      disposers.push(
        cmux.on("shortcut:history-forward", () => goForward()) ?? undefined
      );
      disposers.push(
        cmux.on("shortcut:history-menu", () => requestHistoryMenuToggle()) ??
          undefined
      );
    }
    return () => {
      for (const dispose of disposers) {
        try {
          dispose?.();
        } catch {
          // ignore
        }
      }
    };
  }, [goBack, goForward, requestHistoryMenuToggle]);

  const contextValue = useMemo<NavigationHistoryContextValue>(() => {
    const currentEntry = state.entries[state.currentIndex] ?? null;
    return {
      entries: state.entries,
      currentEntry,
      currentIndex: state.currentIndex,
      canGoBack: state.currentIndex > 0,
      canGoForward: state.currentIndex < state.entries.length - 1,
      goBack,
      goForward,
      goToIndex,
      historyMenuRequestId,
    };
  }, [state, goBack, goForward, goToIndex, historyMenuRequestId]);

  return (
    <NavigationHistoryContext.Provider value={contextValue}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

function createHistoryEntry(location: ParsedLocation): NavigationHistoryEntry {
  const href = location.href ?? location.pathname;
  const pathname = location.pathname ?? "/";
  return {
    id: location.key ?? `${href}:${Date.now()}`,
    href,
    pathname,
    label: formatHistoryLabel(pathname),
    description: formatHistoryDescription(location),
    timestamp: Date.now(),
  };
}

function formatHistoryDescription(location: ParsedLocation): string {
  const href = location.href ?? location.pathname ?? "/";
  return href;
}

function formatHistoryLabel(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "Home";
  }
  const decoded = safeDecode(pathname);
  const segments = decoded.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "Home";
  }
  const raw = segments[segments.length - 1] ?? "";
  const cleaned = raw.replace(/[-_]/g, " ").trim();
  if (!cleaned) {
    return "Home";
  }
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isHistoryModifier(event: KeyboardEvent): boolean {
  if (!event.metaKey || !event.ctrlKey) {
    return false;
  }
  if (event.altKey || event.shiftKey) {
    return false;
  }
  return true;
}
