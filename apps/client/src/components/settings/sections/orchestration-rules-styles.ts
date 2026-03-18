import type { RuleLane, RuleStatus, SkillStatus } from "./useOrchestrationRules";

export const LANE_LABELS: Record<RuleLane, string> = {
  hot: "Hot",
  orchestration: "Orchestration",
  project: "Project",
};

export const LANE_BADGE_STYLES: Record<RuleLane, string> = {
  hot: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  orchestration: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  project: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

export const STATUS_BADGE_STYLES: Record<RuleStatus, string> = {
  candidate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  suppressed: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
  archived: "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500",
};

export const SKILL_STATUS_BADGE_STYLES: Record<SkillStatus, string> = {
  candidate: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  extracted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};
