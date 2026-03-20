/**
 * LogFilter Component
 *
 * Provides filtering controls for log viewing:
 * - Log level filters (DEBUG, INFO, WARN, ERROR)
 * - Activity type filters
 * - Regex search with highlighting
 */

import { useState, useCallback, useMemo } from "react";
import {
  Search,
  X,
  Filter,
  ChevronDown,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  FileEdit,
  FileSearch,
  Terminal,
  GitCommit,
  Brain,
  Wrench,
} from "lucide-react";
import clsx from "clsx";

import {
  LOG_LEVELS,
  LOG_LEVEL_CONFIG_META,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_CONFIG_META,
  INITIAL_FILTER_STATE,
  type LogLevel,
  type ActivityType,
  type LogFilterState,
} from "./log-constants";

// Icon mappings at runtime
const LOG_LEVEL_ICONS: Record<string, typeof AlertTriangle> = {
  Bug,
  Info,
  AlertCircle,
  AlertTriangle,
};

const ACTIVITY_TYPE_ICONS: Record<string, typeof FileEdit> = {
  FileEdit,
  FileSearch,
  Terminal,
  GitCommit,
  AlertTriangle,
  Brain,
  Wrench,
};

interface LogFilterProps {
  filterState: LogFilterState;
  onFilterChange: (state: LogFilterState) => void;
  totalCount: number;
  filteredCount: number;
  levelCounts?: Record<LogLevel, number>;
  typeCounts?: Record<ActivityType, number>;
}

export function LogFilter({
  filterState,
  onFilterChange,
  totalCount,
  filteredCount,
  levelCounts,
  typeCounts,
}: LogFilterProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateFilter = useCallback(
    (updates: Partial<LogFilterState>) => {
      onFilterChange({ ...filterState, ...updates });
    },
    [filterState, onFilterChange]
  );

  // Validate regex
  const handleSearchChange = useCallback(
    (query: string) => {
      let regexError: string | null = null;

      if (filterState.isRegex && query) {
        try {
          new RegExp(query);
        } catch {
          regexError = "Invalid regex pattern";
        }
      }

      updateFilter({ searchQuery: query, regexError });
    },
    [filterState.isRegex, updateFilter]
  );

  // Toggle regex mode
  const toggleRegex = useCallback(() => {
    const newIsRegex = !filterState.isRegex;
    let regexError: string | null = null;

    if (newIsRegex && filterState.searchQuery) {
      try {
        new RegExp(filterState.searchQuery);
      } catch {
        regexError = "Invalid regex pattern";
      }
    }

    updateFilter({ isRegex: newIsRegex, regexError });
  }, [filterState.isRegex, filterState.searchQuery, updateFilter]);

  // Toggle level filter
  const toggleLevel = useCallback(
    (level: LogLevel) => {
      const newLevels = new Set(filterState.levels);
      if (newLevels.has(level)) {
        newLevels.delete(level);
      } else {
        newLevels.add(level);
      }
      updateFilter({ levels: newLevels });
    },
    [filterState.levels, updateFilter]
  );

  // Toggle type filter
  const toggleType = useCallback(
    (type: ActivityType) => {
      const newTypes = new Set(filterState.types);
      if (newTypes.has(type)) {
        newTypes.delete(type);
      } else {
        newTypes.add(type);
      }
      updateFilter({ types: newTypes });
    },
    [filterState.types, updateFilter]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    onFilterChange(INITIAL_FILTER_STATE);
  }, [onFilterChange]);

  const hasActiveFilters = useMemo(
    () =>
      filterState.searchQuery.trim().length > 0 ||
      filterState.levels.size > 0 ||
      filterState.types.size > 0 ||
      filterState.startTime !== null ||
      filterState.endTime !== null,
    [filterState]
  );

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
          <input
            type="text"
            value={filterState.searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={
              filterState.isRegex ? "Search with regex..." : "Search logs..."
            }
            className={clsx(
              "w-full rounded-lg border pl-9 pr-20 py-2 text-sm focus:outline-none focus:ring-2",
              filterState.regexError
                ? "border-red-300 dark:border-red-700 focus:ring-red-500"
                : "border-neutral-200 dark:border-neutral-700 focus:ring-blue-500",
              "bg-white dark:bg-neutral-800"
            )}
          />
          {/* Regex toggle */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleRegex}
              className={clsx(
                "px-2 py-0.5 rounded text-xs font-mono transition-colors",
                filterState.isRegex
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                  : "bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-600"
              )}
              title="Toggle regex search"
            >
              .*
            </button>
            {filterState.searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                className="p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors",
            showAdvanced || hasActiveFilters
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "border-neutral-200 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          )}
        >
          <Filter className="size-4" />
          Filters
          {hasActiveFilters && (
            <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 min-w-[1.25rem] text-center">
              {filterState.levels.size + filterState.types.size + (filterState.searchQuery ? 1 : 0)}
            </span>
          )}
          <ChevronDown
            className={clsx("size-4 transition-transform", showAdvanced && "rotate-180")}
          />
        </button>
      </div>

      {/* Regex error */}
      {filterState.regexError && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {filterState.regexError}
        </p>
      )}

      {/* Filter stats */}
      <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          {hasActiveFilters
            ? `Showing ${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`
            : `${totalCount.toLocaleString()} total logs`}
        </span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-red-600 dark:text-red-400 hover:underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="space-y-4 pt-2 border-t border-neutral-200 dark:border-neutral-700">
          {/* Log levels */}
          <div>
            <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Log Level
            </h4>
            <div className="flex flex-wrap gap-2">
              {LOG_LEVELS.map((level) => {
                const meta = LOG_LEVEL_CONFIG_META[level];
                const Icon = LOG_LEVEL_ICONS[meta.iconName];
                const count = levelCounts?.[level] ?? 0;
                const isActive = filterState.levels.has(level);

                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleLevel(level)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                      isActive
                        ? meta.bgColor + " " + meta.color
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {meta.label}
                    <span className="text-neutral-400 dark:text-neutral-500">
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Activity types */}
          <div>
            <h4 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Activity Type
            </h4>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((type) => {
                const meta = ACTIVITY_TYPE_CONFIG_META[type];
                const Icon = ACTIVITY_TYPE_ICONS[meta.iconName];
                const count = typeCounts?.[type] ?? 0;
                const isActive = filterState.types.has(type);

                if (count === 0) return null;

                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    className={clsx(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                      isActive
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {meta.label}
                    <span className="text-neutral-400 dark:text-neutral-500">
                      ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
