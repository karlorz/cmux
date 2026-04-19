/**
 * Task-Class Model Routing
 *
 * Provides intelligent model selection based on task type, automatically routing
 * work to appropriate cost/capability tiers while preserving user override capability.
 *
 * Task classes map common work types to recommended models:
 * - routine: Fast coding, bug fixes → cheap models
 * - deep-coding: Large refactoring → mid-tier
 * - review: Code review, exploration → cheap
 * - eval: Summaries, labeling → efficient flash models
 * - architecture: Hard planning → frontier tier
 * - large-context: Cross-file comparison → high-context models
 */

export const TASK_CLASSES = [
  "routine",
  "deep-coding",
  "review",
  "eval",
  "architecture",
  "large-context",
] as const;

export type TaskClass = (typeof TASK_CLASSES)[number];

export interface TaskClassMapping {
  taskClass: TaskClass;
  displayName: string;
  description: string;
  /** Default models in priority order (first available wins) */
  defaultModels: string[];
  /** Escalation models when defaults unavailable */
  escalationModels: string[];
  /** Default variant to apply (e.g., "high" for architecture tasks) */
  defaultVariant?: string;
}

export const TASK_CLASS_MAPPINGS: TaskClassMapping[] = [
  {
    taskClass: "routine",
    displayName: "Routine",
    description: "Fast coding, simple bug fixes",
    defaultModels: ["codex/gpt-5.4-mini", "claude/sonnet-4.5"],
    escalationModels: ["codex/gpt-5.4", "claude/opus-4.5"],
  },
  {
    taskClass: "deep-coding",
    displayName: "Deep Coding",
    description: "Large refactoring, multi-file changes",
    defaultModels: ["codex/gpt-5.4", "claude/opus-4.5"],
    escalationModels: ["claude/opus-4.7"],
    defaultVariant: "high",
  },
  {
    taskClass: "review",
    displayName: "Review",
    description: "Code review, exploration",
    defaultModels: ["codex/gpt-5.4-mini", "claude/haiku-4.5"],
    escalationModels: ["claude/sonnet-4.5"],
  },
  {
    taskClass: "eval",
    displayName: "Eval",
    description: "Summaries, labeling, maintenance",
    defaultModels: ["gemini/2.5-flash", "claude/haiku-4.5"],
    escalationModels: ["claude/sonnet-4.5"],
  },
  {
    taskClass: "architecture",
    displayName: "Architecture",
    description: "Complex planning, hard debugging",
    defaultModels: ["claude/opus-4.7", "codex/gpt-5.4-pro"],
    escalationModels: [],
    defaultVariant: "max",
  },
  {
    taskClass: "large-context",
    displayName: "Large Context",
    description: "Cross-file comparison, repo triage",
    defaultModels: ["gemini/2.5-pro"],
    escalationModels: ["claude/opus-4.7"],
  },
];

/**
 * Get the mapping for a specific task class
 */
export function getTaskClassMapping(
  taskClass: TaskClass
): TaskClassMapping | undefined {
  return TASK_CLASS_MAPPINGS.find((m) => m.taskClass === taskClass);
}

/**
 * Get all task class mappings (for UI dropdowns)
 */
export function getAllTaskClassMappings(): TaskClassMapping[] {
  return TASK_CLASS_MAPPINGS;
}

/**
 * Check if a string is a valid task class
 */
export function isValidTaskClass(value: string): value is TaskClass {
  return TASK_CLASSES.includes(value as TaskClass);
}

export interface ResolvedTaskClassModel {
  agentName: string;
  selectedVariant?: string;
  /** Whether fallback/escalation was used */
  wasEscalated: boolean;
}

/**
 * Resolve the best model for a given task class based on available models.
 *
 * Resolution order:
 * 1. Try each default model in order
 * 2. Try each escalation model in order
 * 3. Return null if no model available
 *
 * @param taskClass - The task class to resolve
 * @param availableModels - List of available model names (e.g., from provider status)
 * @returns Resolved model info or null if none available
 */
export function resolveModelForTaskClass(
  taskClass: TaskClass,
  availableModels: string[]
): ResolvedTaskClassModel | null {
  const mapping = getTaskClassMapping(taskClass);
  if (!mapping) {
    return null;
  }

  const availableSet = new Set(availableModels);

  // Try default models first
  for (const model of mapping.defaultModels) {
    if (availableSet.has(model)) {
      return {
        agentName: model,
        selectedVariant: mapping.defaultVariant,
        wasEscalated: false,
      };
    }
  }

  // Try escalation models
  for (const model of mapping.escalationModels) {
    if (availableSet.has(model)) {
      return {
        agentName: model,
        selectedVariant: mapping.defaultVariant,
        wasEscalated: true,
      };
    }
  }

  return null;
}

/**
 * Get the recommended task class for a given model name.
 * This is the inverse lookup - given a model, what task class is it best suited for?
 *
 * Returns the first task class where this model appears as a default,
 * or undefined if the model isn't a default for any class.
 */
export function getRecommendedTaskClassForModel(
  modelName: string
): TaskClass | undefined {
  for (const mapping of TASK_CLASS_MAPPINGS) {
    if (mapping.defaultModels.includes(modelName)) {
      return mapping.taskClass;
    }
  }
  return undefined;
}

/** Selection source tracking for analytics */
export type AgentSelectionSource =
  | "explicit"
  | "task-class-default"
  | "system-default";
