export interface NavigationHistoryEntry {
  id: string;
  historyIndex: number;
  href: string;
  pathname: string;
  searchStr: string;
  hash: string;
  timestamp: number;
}
