import { createContext } from "react";

export type NavigationHistoryEntry = {
  id: string;
  href: string;
  pathname: string;
  label: string;
  description: string;
  timestamp: number;
};

export type NavigationHistoryContextValue = {
  entries: NavigationHistoryEntry[];
  currentEntry: NavigationHistoryEntry | null;
  currentIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  goToIndex: (index: number) => void;
  historyMenuRequestId: number;
};

export const NavigationHistoryContext = createContext<
  NavigationHistoryContextValue | undefined
>(undefined);
