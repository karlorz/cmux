/**
 * Shared scope constants for settings sections.
 * Separated from components to comply with React Fast Refresh rules.
 */

export type ScopeValue = "system" | "team" | "workspace" | "user";

export const SCOPE_LABELS: Record<ScopeValue, string> = {
  system: "System",
  team: "Team",
  workspace: "Workspace",
  user: "User",
};

export const SCOPE_BADGE_STYLES: Record<ScopeValue, string> = {
  system:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  team: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  workspace:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  user: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

export const CONTEXT_LABELS: Record<string, string> = {
  task_sandbox: "Task Sandbox",
  cloud_workspace: "Cloud Workspace",
  local_dev: "Local Dev",
};
