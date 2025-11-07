import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import {
  NavigationHistoryContext,
  type NavigationHistoryContextValue,
} from "./NavigationHistoryContext";
import type { NavigationHistoryEntry } from "./types";

const MAX_TRACKED_ENTRIES = 50;

export function NavigationHistoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const location = useRouterState({
    select: (state) => state.location,
  });
  const [entries, setEntries] = useState<NavigationHistoryEntry[]>([]);
  const history = router.history;

  useEffect(() => {
    setEntries((prev) => {
      const historyIndex = location.state.__TSR_index;
      const id =
        location.state.__TSR_key ?? `${historyIndex}-${location.href ?? ""}`;
      const nextEntry: NavigationHistoryEntry = {
        id,
        historyIndex,
        href: location.href,
        pathname: location.pathname,
        searchStr: location.searchStr,
        hash: location.hash,
        timestamp: Date.now(),
      };
      const existingIdx = prev.findIndex(
        (entry) => entry.historyIndex === historyIndex
      );
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        if (
          existing.href === nextEntry.href &&
          existing.searchStr === nextEntry.searchStr &&
          existing.hash === nextEntry.hash
        ) {
          return prev;
        }
        const updated = [...prev];
        updated[existingIdx] = nextEntry;
        return updated;
      }
      const trimmed = prev.filter((entry) => entry.historyIndex < historyIndex);
      const next = [...trimmed, nextEntry];
      const overflow = next.length - MAX_TRACKED_ENTRIES;
      if (overflow > 0) {
        next.splice(0, overflow);
      }
      return next;
    });
  }, [location]);

  const currentHistoryIndex = location.state.__TSR_index;

  const currentEntry = useMemo(() => {
    return (
      entries.find((entry) => entry.historyIndex === currentHistoryIndex) ??
      null
    );
  }, [entries, currentHistoryIndex]);

  const canGoBack = useMemo(() => {
    try {
      return history?.canGoBack?.() ?? false;
    } catch {
      return false;
    }
  }, [history, currentHistoryIndex]);

  const canGoForward = useMemo(() => {
    return entries.some((entry) => entry.historyIndex > currentHistoryIndex);
  }, [entries, currentHistoryIndex]);

  const goBack = useCallback(() => {
    try {
      history?.back();
    } catch {
      // ignore navigation errors
    }
  }, [history]);

  const goForward = useCallback(() => {
    try {
      history?.forward();
    } catch {
      // ignore navigation errors
    }
  }, [history]);

  const goToEntry = useCallback(
    (entry: NavigationHistoryEntry) => {
      const delta = entry.historyIndex - currentHistoryIndex;
      if (delta === 0) {
        return;
      }
      try {
        history?.go(delta);
      } catch {
        // ignore navigation errors
      }
    },
    [history, currentHistoryIndex]
  );

  const value = useMemo<NavigationHistoryContextValue>(
    () => ({
      entries,
      currentEntry,
      currentHistoryIndex,
      canGoBack,
      canGoForward,
      goBack,
      goForward,
      goToEntry,
    }),
    [
      entries,
      currentEntry,
      currentHistoryIndex,
      canGoBack,
      canGoForward,
      goBack,
      goForward,
      goToEntry,
    ]
  );

  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}
