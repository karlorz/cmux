import { createContext, useContext } from "react";
import type { NavigationHistoryEntry } from "./types";

export interface NavigationHistoryContextValue {
  entries: NavigationHistoryEntry[];
  currentEntry: NavigationHistoryEntry | null;
  currentHistoryIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  goToEntry: (entry: NavigationHistoryEntry) => void;
}

export const NavigationHistoryContext = createContext<
  NavigationHistoryContextValue | null
>(null);

export function useNavigationHistory(): NavigationHistoryContextValue {
  const value = useContext(NavigationHistoryContext);
  if (!value) {
    throw new Error(
      "useNavigationHistory must be used within a NavigationHistoryProvider"
    );
  }
  return value;
}
