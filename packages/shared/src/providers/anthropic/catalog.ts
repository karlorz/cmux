import type { AgentCatalogEntry } from "../../agent-catalog";
import {
  CLAUDE_CURATED_MODELS,
  CLAUDE_DEFAULT_EFFORT_VARIANT,
  CLAUDE_EFFORT_VARIANTS,
} from "./manifest";

const REQUIRED_CLAUDE_API_KEYS = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"];

function getVariantsForModel(
  displayName: string,
  supportsEffort: boolean,
): AgentCatalogEntry["variants"] {
  if (!supportsEffort) {
    return [];
  }
  return CLAUDE_EFFORT_VARIANTS.map((variant) =>
    variant.id === "max"
      ? {
          ...variant,
          description: `Maximum thinking effort supported by ${displayName}`,
        }
      : variant,
  );
}

export const CLAUDE_CATALOG: AgentCatalogEntry[] = CLAUDE_CURATED_MODELS.map(
  (entry) => {
    const supportsCatalogEffort = entry.catalogSupportsEffort ?? entry.supportsEffort;
    return {
      name: entry.agentName,
      displayName: entry.displayName,
      vendor: "anthropic",
      requiredApiKeys: REQUIRED_CLAUDE_API_KEYS,
      tier: "paid",
      tags: entry.tags,
      variants: getVariantsForModel(entry.displayName, supportsCatalogEffort),
      defaultVariant: supportsCatalogEffort
        ? CLAUDE_DEFAULT_EFFORT_VARIANT
        : undefined,
      contextWindow: entry.contextWindow,
      maxOutputTokens: entry.maxOutputTokens,
    };
  },
);
