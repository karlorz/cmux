/**
 * Operator Presets - Pre-configured bundles of orchestration settings.
 *
 * Presets reduce settings sprawl by grouping related configurations
 * into meaningful combinations that can be selected with one click.
 */

import type { TaskClass } from "./task-class-routing";

/**
 * Built-in preset IDs. These are system-provided and cannot be deleted.
 */
export const BUILTIN_PRESET_IDS = [
  "quick",
  "standard",
  "thorough",
  "architecture",
] as const;

export type BuiltinPresetId = (typeof BUILTIN_PRESET_IDS)[number];

/**
 * Preset configuration shape.
 */
export interface OperatorPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Task class for automatic model selection (if agentName not set) */
  taskClass?: TaskClass;
  /** Explicit agent/model name (overrides taskClass routing) */
  agentName?: string;
  /** Model variant/effort level */
  selectedVariant?: string;
  /** Supervisor profile ID reference */
  supervisorProfileId?: string;
  /** Queue priority (1 = highest, 10 = lowest) */
  priority: number;
  /** Whether this is a built-in preset (non-deletable) */
  isBuiltin: boolean;
}

/**
 * Built-in presets available to all teams.
 * These provide sensible defaults without requiring configuration.
 */
export const BUILTIN_PRESETS: OperatorPreset[] = [
  {
    id: "quick",
    name: "Quick Task",
    description: "Fast execution with minimal review",
    icon: "zap",
    taskClass: "routine",
    priority: 5,
    isBuiltin: true,
  },
  {
    id: "standard",
    name: "Standard",
    description: "Balanced speed and quality (recommended)",
    icon: "target",
    taskClass: "deep-coding",
    priority: 5,
    isBuiltin: true,
  },
  {
    id: "thorough",
    name: "Thorough Review",
    description: "Extra validation and testing",
    icon: "search",
    taskClass: "review",
    priority: 3,
    isBuiltin: true,
  },
  {
    id: "architecture",
    name: "Architecture",
    description: "Complex planning with frontier models",
    icon: "building",
    taskClass: "architecture",
    priority: 2,
    isBuiltin: true,
  },
];

/**
 * Get a built-in preset by ID.
 */
export function getBuiltinPreset(id: BuiltinPresetId): OperatorPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}

/**
 * Check if a preset ID is a built-in preset.
 */
export function isBuiltinPresetId(id: string): id is BuiltinPresetId {
  return BUILTIN_PRESET_IDS.includes(id as BuiltinPresetId);
}

/**
 * Merge custom presets with built-in presets.
 * Custom presets with the same ID override built-ins.
 */
export function mergePresetsWithBuiltins(
  customPresets: OperatorPreset[]
): OperatorPreset[] {
  const customIds = new Set(customPresets.map((p) => p.id));
  const builtins = BUILTIN_PRESETS.filter((p) => !customIds.has(p.id));
  return [...builtins, ...customPresets];
}

/**
 * Apply a preset to spawn options.
 * Returns the fields to be used when creating a task.
 */
export function applyPresetToSpawnOptions(preset: OperatorPreset): {
  taskClass?: TaskClass;
  agentName?: string;
  selectedVariant?: string;
  supervisorProfileId?: string;
  priority: number;
} {
  return {
    taskClass: preset.taskClass,
    agentName: preset.agentName,
    selectedVariant: preset.selectedVariant,
    supervisorProfileId: preset.supervisorProfileId,
    priority: preset.priority,
  };
}
