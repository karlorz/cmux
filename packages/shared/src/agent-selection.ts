import type { AgentConfig } from "./agentConfig";
import { AGENT_CONFIGS } from "./agentConfig";
import {
  normalizeAgentSelection,
  type NormalizedAgentSelection,
} from "./agent-selection-core";
import {
  createCodexVariantConfig,
  type CodexReasoningEffort,
} from "./providers/openai/configs";
import { createDynamicClaudeConfig } from "./providers/anthropic/configs";
import { createOpencodeFreeDynamicConfig } from "./providers/opencode/configs";
import {
  resolveModelForTaskClass,
  type AgentSelectionSource,
  type TaskClass,
} from "./task-class-routing";

function resolveAgentConfig(
  agentName: string,
  selectedVariant: string | undefined,
): AgentConfig {
  if (agentName.startsWith("codex/")) {
    const model = agentName.slice("codex/".length);
    return createCodexVariantConfig({
      model,
      publicAgentName: agentName,
      reasoningEffort: selectedVariant as CodexReasoningEffort | undefined,
    });
  }

  const staticConfig = AGENT_CONFIGS.find(
    (config) => config.name === agentName,
  );
  if (staticConfig) {
    return staticConfig;
  }

  const dynamicClaudeConfig = createDynamicClaudeConfig(agentName);
  if (dynamicClaudeConfig) {
    return dynamicClaudeConfig;
  }

  const dynamicOpenCodeConfig = createOpencodeFreeDynamicConfig(agentName);
  if (dynamicOpenCodeConfig) {
    return dynamicOpenCodeConfig;
  }

  throw new Error(`Agent not found: ${agentName}`);
}

export interface ResolvedAgentSelection {
  requestedAgentName: NormalizedAgentSelection["requestedAgentName"];
  assignedAgentName: NormalizedAgentSelection["assignedAgentName"];
  selectedVariant?: NormalizedAgentSelection["selectedVariant"];
  catalogEntry?: NormalizedAgentSelection["catalogEntry"];
  variants: NormalizedAgentSelection["variants"];
  defaultVariant?: NormalizedAgentSelection["defaultVariant"];
  taskClass?: NormalizedAgentSelection["taskClass"];
  selectionSource: NormalizedAgentSelection["selectionSource"];
  agentConfig: AgentConfig;
}

/** Default model for system-default selection */
const SYSTEM_DEFAULT_AGENT = "claude/sonnet-4.5";

export interface ResolveAgentSelectionOptions {
  /** Explicit agent name (takes precedence over taskClass) */
  agentName?: string;
  /** Explicit variant selection */
  selectedVariant?: string | null;
  /** Whether to apply catalog default variant */
  applyDefaultVariant?: boolean;
  /** Task class for automatic model selection */
  taskClass?: TaskClass;
  /** Available models for task-class routing (required when using taskClass without agentName) */
  availableModels?: string[];
}

/**
 * Resolve agent selection with support for task-class routing.
 *
 * Resolution priority:
 * 1. Explicit agentName (if provided) → selectionSource: "explicit"
 * 2. TaskClass routing (if taskClass + availableModels provided) → selectionSource: "task-class-default"
 * 3. System default → selectionSource: "system-default"
 */
export function resolveAgentSelection(
  options: ResolveAgentSelectionOptions
): ResolvedAgentSelection {
  let effectiveAgentName: string;
  let effectiveVariant: string | null | undefined = options.selectedVariant;
  let taskClass: TaskClass | undefined = options.taskClass;
  let selectionSource: AgentSelectionSource;

  // Priority 1: Explicit agent name
  if (options.agentName) {
    effectiveAgentName = options.agentName;
    selectionSource = "explicit";
  }
  // Priority 2: Task-class routing
  else if (options.taskClass && options.availableModels) {
    const resolved = resolveModelForTaskClass(
      options.taskClass,
      options.availableModels
    );
    if (resolved) {
      effectiveAgentName = resolved.agentName;
      // Use task-class variant if no explicit variant provided
      if (effectiveVariant === undefined) {
        effectiveVariant = resolved.selectedVariant;
      }
      selectionSource = "task-class-default";
    } else {
      // Task-class routing failed, fall back to system default
      effectiveAgentName = SYSTEM_DEFAULT_AGENT;
      selectionSource = "system-default";
    }
  }
  // Priority 3: System default
  else {
    effectiveAgentName = options.agentName ?? SYSTEM_DEFAULT_AGENT;
    selectionSource = options.agentName ? "explicit" : "system-default";
  }

  const normalized = normalizeAgentSelection({
    agentName: effectiveAgentName,
    selectedVariant: effectiveVariant,
    applyDefaultVariant: options.applyDefaultVariant,
    taskClass,
    selectionSource,
  });

  return {
    requestedAgentName: normalized.requestedAgentName,
    assignedAgentName: normalized.assignedAgentName,
    selectedVariant: normalized.selectedVariant,
    catalogEntry: normalized.catalogEntry,
    variants: normalized.variants,
    defaultVariant: normalized.defaultVariant,
    taskClass: normalized.taskClass,
    selectionSource: normalized.selectionSource,
    agentConfig: resolveAgentConfig(
      normalized.assignedAgentName,
      normalized.selectedVariant
    ),
  };
}
