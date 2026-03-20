/**
 * Log Filter Utilities
 *
 * Separated from components to satisfy react-refresh/only-export-components rule.
 */

import type { ReactNode } from "react";
import type { LogFilterState, ActivityType } from "./log-constants";

/**
 * Utility to apply filter state to log entries
 */
export function filterLogs<T extends { type: string; summary: string; toolName?: string }>(
  logs: T[],
  filterState: LogFilterState
): T[] {
  let result = logs;

  // Filter by type
  if (filterState.types.size > 0) {
    result = result.filter((log) => filterState.types.has(log.type as ActivityType));
  }

  // Filter by search query
  if (filterState.searchQuery.trim()) {
    if (filterState.isRegex && !filterState.regexError) {
      try {
        const regex = new RegExp(filterState.searchQuery, "i");
        result = result.filter(
          (log) =>
            regex.test(log.summary) || (log.toolName && regex.test(log.toolName))
        );
      } catch {
        // Invalid regex, skip filtering
      }
    } else {
      const query = filterState.searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.summary.toLowerCase().includes(query) ||
          log.toolName?.toLowerCase().includes(query)
      );
    }
  }

  return result;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlight matching text with the search pattern.
 * Returns the original string if no matches, or ReactNode elements with highlights.
 */
export function highlightMatches(
  text: string,
  searchQuery: string,
  isRegex: boolean
): ReactNode {
  if (!searchQuery.trim()) return text;

  try {
    const pattern = isRegex ? searchQuery : escapeRegex(searchQuery);
    const regex = new RegExp(`(${pattern})`, "gi");

    const parts = text.split(regex);
    if (parts.length === 1) return text;

    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          className="bg-yellow-200 dark:bg-yellow-700/50 text-neutral-900 dark:text-neutral-100 rounded px-0.5"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch {
    return text;
  }
}
