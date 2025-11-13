import {
  useRouter,
  useRouterState,
  type AnyRouteMatch,
  type ParsedLocation,
} from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MAX_HISTORY_ENTRIES = 15;

export type NavigationHistoryEntry = {
  key: string;
  title: string;
  href: string;
  pathname: string;
  searchStr: string;
  hash: string;
  visitedAt: number;
};

type NavigationHistoryState = {
  entries: NavigationHistoryEntry[];
  currentIndex: number;
};

type NavigationHistoryValue = {
  entries: NavigationHistoryEntry[];
  recentEntries: NavigationHistoryEntry[];
  currentEntry: NavigationHistoryEntry | null;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  navigateTo: (entry: NavigationHistoryEntry) => void;
};

const NavigationHistoryContext = createContext<NavigationHistoryValue | null>(
  null
);

function createLocationKey(location: ParsedLocation): string {
  const hash = location.hash ?? "";
  return `${location.pathname}|${location.searchStr}|${hash}`;
}

function formatPathname(pathname: string): string {
  if (!pathname) return "cmux";
  const segments = pathname
    .split("/")
    .filter((segment) => segment.length > 0)
    .filter((segment) => !segment.startsWith("_") && !segment.startsWith("$"));
  if (segments.length === 0) {
    return "cmux";
  }
  const last = segments[segments.length - 1];
  return last
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveTitleFromMatch(match: AnyRouteMatch | undefined): string {
  if (!match) return "cmux";
  const staticData = match.staticData;
  if (staticData && typeof staticData === "object" && "title" in staticData) {
    const candidate = (staticData as { title?: unknown }).title;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return formatPathname(match.pathname ?? "");
}

function createHistoryEntry(
  location: ParsedLocation,
  title: string
): NavigationHistoryEntry {
  return {
    key: createLocationKey(location),
    title: title || "cmux",
    href: location.href,
    pathname: location.pathname,
    searchStr: location.searchStr,
    hash: location.hash,
    visitedAt: Date.now(),
  };
}

function syncHistoryWithLocation(
  prev: NavigationHistoryState,
  location: ParsedLocation,
  title: string
): NavigationHistoryState {
  const entry = createHistoryEntry(location, title);
  if (prev.entries.length === 0) {
    return {
      entries: [entry],
      currentIndex: 0,
    };
  }

  const { entries, currentIndex } = prev;
  const current = entries[currentIndex];
  if (current && current.key === entry.key) {
    if (current.title === entry.title) {
      return prev;
    }
    const nextEntries = entries.slice();
    nextEntries[currentIndex] = { ...current, title: entry.title };
    return { entries: nextEntries, currentIndex };
  }

  const backEntry =
    currentIndex > 0 ? entries[currentIndex - 1] : undefined;
  if (backEntry && backEntry.key === entry.key) {
    const nextEntries = entries.slice();
    nextEntries[currentIndex - 1] = {
      ...backEntry,
      title: entry.title,
      href: entry.href,
    };
    return {
      entries: nextEntries,
      currentIndex: currentIndex - 1,
    };
  }

  const forwardEntry =
    currentIndex < entries.length - 1
      ? entries[currentIndex + 1]
      : undefined;
  if (forwardEntry && forwardEntry.key === entry.key) {
    const nextEntries = entries.slice();
    nextEntries[currentIndex + 1] = {
      ...forwardEntry,
      title: entry.title,
      href: entry.href,
    };
    return {
      entries: nextEntries,
      currentIndex: currentIndex + 1,
    };
  }

  const nextEntries = entries.slice(0, currentIndex + 1).concat(entry);
  const overflow = nextEntries.length - MAX_HISTORY_ENTRIES;
  if (overflow > 0) {
    return {
      entries: nextEntries.slice(overflow),
      currentIndex: nextEntries.length - 1 - overflow,
    };
  }

  return {
    entries: nextEntries,
    currentIndex: nextEntries.length - 1,
  };
}

export function NavigationHistoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const location = useRouterState({
    select: (state) => state.location,
  });
  const matches = useRouterState({
    select: (state) => state.matches,
  });

  const activeMatch = matches[matches.length - 1];
  const resolvedTitle = useMemo(
    () => resolveTitleFromMatch(activeMatch),
    [activeMatch]
  );

  const initialEntryRef = useRef<NavigationHistoryEntry | null>(null);
  if (initialEntryRef.current === null) {
    initialEntryRef.current = createHistoryEntry(location, resolvedTitle);
  }

  const [history, setHistory] = useState<NavigationHistoryState>(() => {
    const entry = initialEntryRef.current;
    return entry
      ? { entries: [entry], currentIndex: 0 }
      : { entries: [], currentIndex: -1 };
  });

  useEffect(() => {
    setHistory((prev) => syncHistoryWithLocation(prev, location, resolvedTitle));
  }, [location.pathname, location.searchStr, location.hash, location.href, resolvedTitle]);

  const { entries, currentIndex } = history;
  const currentEntry = currentIndex >= 0 ? entries[currentIndex] : null;
  const canGoBack = currentIndex > 0;
  const canGoForward =
    currentIndex >= 0 && currentIndex < entries.length - 1;

  const recentEntries = useMemo(() => {
    return [...entries].reverse();
  }, [entries]);

  const goBack = useCallback(() => {
    if (!canGoBack) return;
    router.history.back();
  }, [canGoBack, router]);

  const goForward = useCallback(() => {
    if (!canGoForward) return;
    router.history.forward();
  }, [canGoForward, router]);

  const navigateTo = useCallback(
    (entry: NavigationHistoryEntry) => {
      if (!entry) return;
      router.history.push(entry.href);
    },
    [router]
  );

  const value = useMemo<NavigationHistoryValue>(
    () => ({
      entries,
      recentEntries,
      currentEntry,
      canGoBack,
      canGoForward,
      goBack,
      goForward,
      navigateTo,
    }),
    [
      entries,
      recentEntries,
      currentEntry,
      canGoBack,
      canGoForward,
      goBack,
      goForward,
      navigateTo,
    ]
  );

  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory(): NavigationHistoryValue {
  const context = useContext(NavigationHistoryContext);
  if (!context) {
    throw new Error(
      "useNavigationHistory must be used within a NavigationHistoryProvider"
    );
  }
  return context;
}
