/**
 * Log Filter Constants and Types
 *
 * Separated from components to satisfy react-refresh/only-export-components rule.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export const LOG_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"];

export const LOG_LEVEL_CONFIG_META: Record<
  LogLevel,
  { iconName: "Bug" | "Info" | "AlertCircle" | "AlertTriangle"; color: string; bgColor: string; label: string }
> = {
  DEBUG: {
    iconName: "Bug",
    color: "text-neutral-500 dark:text-neutral-400",
    bgColor: "bg-neutral-100 dark:bg-neutral-800",
    label: "Debug",
  },
  INFO: {
    iconName: "Info",
    color: "text-blue-500 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    label: "Info",
  },
  WARN: {
    iconName: "AlertCircle",
    color: "text-amber-500 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    label: "Warning",
  },
  ERROR: {
    iconName: "AlertTriangle",
    color: "text-red-500 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    label: "Error",
  },
};

export const ACTIVITY_TYPES = [
  "file_edit",
  "file_read",
  "bash_command",
  "git_commit",
  "error",
  "thinking",
  "test_run",
  "tool_call",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_CONFIG_META: Record<
  ActivityType,
  { iconName: string; color: string; label: string }
> = {
  file_edit: {
    iconName: "FileEdit",
    color: "text-blue-500 dark:text-blue-400",
    label: "File Edit",
  },
  file_read: {
    iconName: "FileSearch",
    color: "text-neutral-500 dark:text-neutral-400",
    label: "File Read",
  },
  bash_command: {
    iconName: "Terminal",
    color: "text-green-600 dark:text-green-400",
    label: "Command",
  },
  git_commit: {
    iconName: "GitCommit",
    color: "text-purple-500 dark:text-purple-400",
    label: "Git Commit",
  },
  error: {
    iconName: "AlertTriangle",
    color: "text-red-500 dark:text-red-400",
    label: "Error",
  },
  thinking: {
    iconName: "Brain",
    color: "text-neutral-400 dark:text-neutral-500",
    label: "Thinking",
  },
  test_run: {
    iconName: "Terminal",
    color: "text-amber-500 dark:text-amber-400",
    label: "Test",
  },
  tool_call: {
    iconName: "Wrench",
    color: "text-neutral-500 dark:text-neutral-400",
    label: "Tool",
  },
};

export interface LogFilterState {
  searchQuery: string;
  isRegex: boolean;
  regexError: string | null;
  levels: Set<LogLevel>;
  types: Set<ActivityType>;
  startTime: number | null;
  endTime: number | null;
}

export const INITIAL_FILTER_STATE: LogFilterState = {
  searchQuery: "",
  isRegex: false,
  regexError: null,
  levels: new Set(),
  types: new Set(),
  startTime: null,
  endTime: null,
};
