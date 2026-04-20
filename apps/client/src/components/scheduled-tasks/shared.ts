import { DEFAULT_CLAUDE_AGENT_NAME } from "@cmux/shared/providers/anthropic/models";

/**
 * Shared constants for scheduled task dialogs.
 * Extracted from CreateScheduledTaskDialog and EditScheduledTaskDialog
 * to avoid duplication and ensure consistency.
 */

export const DEFAULT_AGENT_NAME = DEFAULT_CLAUDE_AGENT_NAME;

export const AGENT_OPTIONS = [
  { value: DEFAULT_AGENT_NAME, label: "Claude Opus 4.7" },
  { value: "claude/opus-4.5", label: "Claude Opus 4.5" },
  { value: "claude/sonnet-4", label: "Claude Sonnet 4" },
  { value: "claude/haiku-4.5", label: "Claude Haiku 4.5" },
  { value: "codex/gpt-5.1-codex", label: "Codex GPT-5.1" },
  { value: "codex/gpt-5.1-codex-mini", label: "Codex GPT-5.1 Mini" },
  { value: "gemini/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

export const SCHEDULE_TYPE_OPTIONS = [
  { value: "interval", label: "Every X minutes" },
  { value: "daily", label: "Daily at specific time" },
  { value: "weekly", label: "Weekly on specific day" },
  { value: "cron", label: "Custom cron expression" },
];

export const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];
