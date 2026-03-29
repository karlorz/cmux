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
import { createOpencodeFreeDynamicConfig } from "./providers/opencode/configs";

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
  agentConfig: AgentConfig;
}

export function resolveAgentSelection(options: {
  agentName: string;
  selectedVariant?: string | null;
  applyDefaultVariant?: boolean;
}): ResolvedAgentSelection {
  const normalized = normalizeAgentSelection(options);

  return {
    requestedAgentName: normalized.requestedAgentName,
    assignedAgentName: normalized.assignedAgentName,
    selectedVariant: normalized.selectedVariant,
    catalogEntry: normalized.catalogEntry,
    variants: normalized.variants,
    defaultVariant: normalized.defaultVariant,
    agentConfig: resolveAgentConfig(
      normalized.assignedAgentName,
      normalized.selectedVariant,
    ),
  };
}
