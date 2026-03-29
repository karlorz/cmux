import { z } from "zod";

const SETTINGS_SECTION_VALUES = [
  "general",
  "ai-providers",
  "models",
  "model-catalog",
  "mcp-servers",
  "policy-rules",
  "permission-rules",
  "agent-configs",
  "orchestration-rules",
  "orchestration-settings",
  "git",
  "worktrees",
  "archived",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTION_VALUES)[number];

export const settingsSectionSchema = z.enum(SETTINGS_SECTION_VALUES);

const settingsSectionSet = new Set<string>(SETTINGS_SECTION_VALUES);

function isSettingsSection(sectionFromSearch: unknown): sectionFromSearch is SettingsSection {
  return typeof sectionFromSearch === "string" && settingsSectionSet.has(sectionFromSearch);
}

export function resolveActiveSettingsSection(sectionFromSearch: unknown): SettingsSection {
  return isSettingsSection(sectionFromSearch) ? sectionFromSearch : "general";
}
